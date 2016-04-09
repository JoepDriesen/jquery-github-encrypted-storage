/*!
 * jQuery Github Encrypted Storage
 * Original author: Joep Driesen
 * Further changes, comments: JoepDriesen
 * Licensed under the GNU GPL v3 license
 */

// the semi-colon before the function invocation is a safety 
// net against concatenated scripts and/or other plugins 
// that are not closed properly.
;(function ( $, window, document, undefined ) {
    
    // undefined is used here as the undefined global 
    // variable in ECMAScript 3 and is mutable (i.e. it can 
    // be changed by someone else). undefined isn't really 
    // being passed in so we can ensure that its value is 
    // truly undefined. In ES5, undefined can no longer be 
    // modified.
    
    // window and document are passed through as local 
    // variables rather than as globals, because this (slightly) 
    // quickens the resolution process and can be more 
    // efficiently minified (especially when both are 
    // regularly referenced in your plugin).

    // Create the defaults once
    var pluginName = 'githubEncryptedStorage',
        defaults = {
    		app_name: 'Default',
    		encryption_passphrase: null,
        };

    // The actual plugin constructor
    function Plugin( element, options ) {
        this.element = element;

        // jQuery has an extend method that merges the 
        // contents of two or more objects, storing the 
        // result in the first object. The first object 
        // is generally empty because we don't want to alter 
        // the default options for future instances of the plugin
        this.options = $.extend( {}, defaults, options) ;
        
        this._defaults = defaults;
        this._name = pluginName;
        
        this.init();
    }

    Plugin.prototype.init = function () {
    	var self = this;
    	
        if (!this.options.github_username) {
            throw 'githubEncryptedStorage requires the github_username option';
        }
        if (!this.options.github_password) {
            throw 'githubEncryptedStorage requires the github_password option';
        }
        if (!this.options.github_repo) {
            throw 'githubEncryptedStorage requires the github_repo option';
        }
        
        this._github_repos_url = 'https://api.github.com/repos/' + this.options.github_username + '/' + this.options.github_repo;
        this._basic_auth_string = "Basic " + btoa(this.options.github_username + ':' + this.options.github_password)
    };
    
    Plugin.prototype.decrypt = function (cypher_text, is_json=true) {
        var stringified = cypher_text;
        
        if (this.options.encryption_passphrase) {
        	var key128Bits = CryptoJS.PBKDF2(this.options.encryption_passphrase, CryptoJS.enc.Hex.parse(this.options.app_name), { keySize: 128/32 });
            try {
            	var decrypted = CryptoJS.AES.decrypt(cypher_text, this.options.encryption_passphrase);

                var stringified = decrypted.toString(CryptoJS.enc.Utf8);
                if (is_json)
                	return JSON.parse(stringified);
            } catch (e) {
            	var decrypted = CryptoJS.AES.decrypt(cypher_text, key128Bits, { iv: CryptoJS.enc.Hex.parse(this.options.app_name) });

                var stringified = decrypted.toString(CryptoJS.enc.Utf8);
                if (is_json)
                	return JSON.parse(stringified);
            }
            
            var stringified = decrypted.toString(CryptoJS.enc.Utf8);
        }
        
        if (is_json)
        	return JSON.parse(stringified);
        return stringified
    };
    
    Plugin.prototype.encrypt = function (to_encrypt, is_json=true) {
        
    	var stringified = to_encrypt;
    	if (is_json)
    		stringified = JSON.stringify(to_encrypt);
        
        if (!this.options.encryption_passphrase)
            return stringified;

    	var key128Bits = CryptoJS.PBKDF2(this.options.encryption_passphrase, CryptoJS.enc.Hex.parse(this.options.app_name), { keySize: 128/32 });
        var encrypted = CryptoJS.AES.encrypt(stringified, key128Bits, { iv: CryptoJS.enc.Hex.parse(this.options.app_name) });
        
        return encrypted.toString();
    };
    
    Plugin.prototype.objects = function (labels_filter) {
        var issuePromise = $.Deferred();
        
        var self = this;
        
        $.ajax({
            url: this._github_repos_url + '/issues',
        }).success(function(data) {
            issuePromise.resolve(data.filter(function(issue) {
				if (labels_filter.length <= 0)
					return true;
				
				for (label_i in issue.labels) {
					var label = self.decrypt(issue.labels[label_i].name).label;
					if (labels_filter.indexOf(label) >= 0)
						return true;
				}
				return false;
			}).map(function(issue) {
                return {
                    id: issue.number,
                    json: self.decrypt(issue.body),
                    labels: issue.labels.map(function (l) { l.name = self.decrypt(l.name).label; return l; })
                };
            }));
        }).error(function(e) {
            issuePromise.reject('Error while contacting Github API', e);
        });
        
        return issuePromise.promise();
    };
    
    Plugin.prototype.labels = function () {
        var labelsPromise = $.Deferred();
        
        self = this;
        
        $.ajax({
            url: this._github_repos_url + '/labels',
            method: 'GET'
        }).success(function(data) {
        	labelsPromise.resolve(data.map(function(l) {
        		return {
            		name: self.decrypt(l.name).label,
            		color: l.color
            	};
            }));
        }).error(function(e) {
            labelsPromise.reject('Error while contacting Github API', e);
        });
        
        return labelsPromise.promise();
    };
    
    Plugin.prototype.removeObject = function(id) {
        var issuePromise = $.Deferred();
        
        $.ajax({
			url: this._github_repos_url + '/issues/' + id,
			method: 'PATCH',
			headers: { Authorization: this._basic_auth_string },
			data: JSON.stringify({
				state: 'closed',
			}),
		}).success(function(data) {
            issuePromise.resolve('success');
        }).error(function(e) {
            issuePromise.reject('Error while contacting Github API', e);
        });
        
        return issuePromise.promise();
    };
    
    Plugin.prototype.saveObject = function(json_object, labels, existing_id) {
        var issuePromise = $.Deferred();
        
        var self = this;
        
        labels = labels.map(function(l) { 
        	return self.encrypt({
        		app_name: self.options.app_name,
        		label: l,
        	});
        });
        
        var req;
        if (existing_id === undefined) {
            req = $.ajax({
                url: this._github_repos_url + '/issues',
                method: 'POST',
                headers: { Authorization: this._basic_auth_string },
                data: JSON.stringify({
					title: this.encrypt(Math.floor((Math.random() * 100) + 1)),
                    body: this.encrypt(json_object),
                    labels: labels ? labels : [],
                }),
                contentType:"application/json"
            });
        } else {
            req = $.ajax({
                url: this._github_repos_url + '/issues/' + existing_id,
                method: 'PATCH',
                headers: { Authorization: this._basic_auth_string },
                data: JSON.stringify({
                    body: this.encrypt(json_object),
                    labels: labels ? labels : [],
                }),
                contentType:"application/json"
            });
        }
        
        req.success(function(data) {
            issuePromise.resolve('success');
        }).error(function(e) {
            issuePromise.reject('Error while contacting Github API', e);
        });
        
        return issuePromise.promise();
    };

    // A really lightweight plugin wrapper around the constructor, 
    // preventing against multiple instantiations
    $[pluginName] = function ( options ) {
        if (!$.data(this, 'plugin_' + pluginName)) {
            $.data(this, 'plugin_' + pluginName, 
            new Plugin( this, options ));
            
            return $.data(this, 'plugin_' + pluginName);
        }
    }

})( jQuery, window, document );
