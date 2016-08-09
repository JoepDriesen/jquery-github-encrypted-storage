;let githubEncryptedStorage = (function ( $, undefined) {
	
    let defaults = {
		app_name: 'Default',
		encryption_passphrase: null,
	};

    // The actual plugin constructor
    function GithubEncryptedStorage( options ) {
        // jQuery has an extend method that merges the 
        // contents of two or more objects, storing the 
        // result in the first object.
        this.options = $.extend( {}, defaults, options) ;
        
        this._defaults = defaults;
		
		this.init();
    }

    GithubEncryptedStorage.prototype.init = function () {
    	var self = this;
    	
        if (!self.options.github_username) {
            throw 'githubEncryptedStorage requires the github_username option';
        }
        if (!self.options.github_password) {
            throw 'githubEncryptedStorage requires the github_password option';
        }
        if (!self.options.github_repo) {
            throw 'githubEncryptedStorage requires the github_repo option';
        }
        
        self._github_repos_url = 'https://api.github.com/repos/' + this.options.github_username + '/' + this.options.github_repo;
        self._basic_auth_string = "Basic " + btoa(this.options.github_username + ':' + this.options.github_password);
		
		self.milestone = $.when ( self._milestone() );
    };
    
    GithubEncryptedStorage.prototype.decrypt = function (cypher_text, is_json=true) {
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
    
    GithubEncryptedStorage.prototype.encrypt = function (to_encrypt, is_json=true) {
        
    	var stringified = to_encrypt;
    	if (is_json)
    		stringified = JSON.stringify(to_encrypt);
        
        if (!this.options.encryption_passphrase)
            return stringified;

    	var key128Bits = CryptoJS.PBKDF2(this.options.encryption_passphrase, CryptoJS.enc.Hex.parse(this.options.app_name), { keySize: 128/32 });
        var encrypted = CryptoJS.AES.encrypt(stringified, key128Bits, { iv: CryptoJS.enc.Hex.parse(this.options.app_name) });
        
        return encrypted.toString();
    };
    
	GithubEncryptedStorage.prototype.objects = function (labels_filter) {
        	var issuePromise = $.Deferred();
        
     		var self = this;
     		
     		var data = {};
     		
     		if ( typeof( labels_filter ) !== 'undefined' && labels_filter.length > 0 )
     			data.labels = labels_filter.map( function( l ) { return self.encrypt( {
        			app_name: self.options.app_name,
        			label: l,
        	} ); } ).join( ',' );
        
		self.milestone.then(function(milestone) {
			data.milestone = milestone.number;
			
			$.ajax({
				url: self._github_repos_url + '/issues',
				method: 'GET',
				headers: { Authorization: self._basic_auth_string },
				data: data,
			}).success(function(data) {
				issuePromise.resolve(data.map(function(issue) {
					return {
						id: issue.number,
						json: self.decrypt(issue.body),
						labels: issue.labels.map(function (l) { l.name = self.decrypt(l.name).label; return l; }),
					};
				}));
			}).error(function(e) {
				issuePromise.reject('Error while contacting Github API', e);
			});
		}, function(e) {
			issuePromise.reject('Error while contacting Github API', e);
		});
        
        return issuePromise.promise();
    };
    
    GithubEncryptedStorage.prototype.labels = function () {
        var labelsPromise = $.Deferred();
        
        let self = this;
        
        $.ajax({
            url: this._github_repos_url + '/labels',
            method: 'GET',
			headers: { Authorization: this._basic_auth_string },
        }).success(function(data) {
        	labelsPromise.resolve(data.reduce(function(prev, l) {
				try {
					prev.push( {
						name: self.decrypt(l.name).label,
						color: l.color
					} );
				} catch (e) {}
				
				return prev;
            }, []));
        }).error(function(e) {
            labelsPromise.reject('Error while contacting Github API', e);
        });
        
        return labelsPromise.promise();
    };
	
	GithubEncryptedStorage.prototype._milestone = function () {
		let self = this;
		
		var milestonePromise = $.Deferred();
		
		$.ajax({
			url: self._github_repos_url + '/milestones',
			method: 'GET',
			headers: { Authorization: this._basic_auth_string },
		}).success(function(data) {
			milestone = data.filter(function(m) {
				return m.title === self.encrypt(self.options.app_name, false);
            });
			
			if (milestone.length > 0)
				milestonePromise.resolve(milestone[0]);
			
			else {
				$.ajax({
					url: self._github_repos_url + '/milestones',
					method: 'POST',
					headers: { Authorization: self._basic_auth_string },
					data: JSON.stringify({
						title: self.encrypt(self.options.app_name, false),
					}),
					contentType:"application/json"
				}).success(function(data) {
					milestonePromise.resolve(milestone);
				}).error(function(e) {
					milestonePromise.reject(e);
				});
			}
		}).error(function(e) {
			milestonePromise.reject(e);
		});
		
		return milestonePromise.promise();
	};
    
    GithubEncryptedStorage.prototype.removeObject = function(id) {
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
    
    GithubEncryptedStorage.prototype.saveObject = function(json_object, labels, existing_id) {
        var issuePromise = $.Deferred();
        
        var self = this;
        
        if ( labels ) {
        	labels = labels.map(function(l) { 
        		return self.encrypt({
        			app_name: self.options.app_name,
        			label: l,
        		});
        	});
        }
        
		self.milestone.then(function (milestone) {
			var req;
			if (existing_id === undefined) {
				req = $.ajax({
					url: self._github_repos_url + '/issues',
					method: 'POST',
					headers: { Authorization: self._basic_auth_string },
					data: JSON.stringify({
						title: self.encrypt(Math.floor((Math.random() * 100) + 1)),
						body: self.encrypt(json_object),
						labels: labels ? labels : [],
						milestone: milestone.number,
					}),
					contentType:"application/json"
				});
			} else {
				req = $.ajax({
					url: self._github_repos_url + '/issues/' + existing_id,
					method: 'PATCH',
					headers: { Authorization: self._basic_auth_string },
					data: JSON.stringify({
						body: self.encrypt(json_object),
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
		});
        
        return issuePromise.promise();
    };
	
	return function ( options ) {
        return new GithubEncryptedStorage( options );
    }
	
}( jQuery ));
