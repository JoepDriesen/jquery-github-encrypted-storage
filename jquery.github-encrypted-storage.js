( function ( $ ) {
    
    var GES = function( username, password, params ) {
        
        var self = this;
        
        self.version = '0.3';
        
        self.username = username;
        self.password = password;
        self.params = params;
        
        self._github_repos_url = 'https://api.github.com/repos/' + self.username + '/' + self.params.repository_name;
        self._basic_auth_string = "Basic " + btoa( self.username + ':' + self.password );
        self._headers = { 
            Authorization: self._basic_auth_string,
            Accept: 'application/vnd.github.v3+json',
        };
        
        self.connection = new Promise( ( resolve, reject ) => {
            
            $.ajax( {
                url: self._github_repos_url,
                method: 'GET',
                headers: self._headers,
                contentType: "application/json",
                success:  ( repos, status, req ) => resolve( { repos: repos, status: status, req: req } ),
                error: function( jqXHR, textStatus, errorThrown ) {
                    if ( jqXHR.status !== 404 )
                        return reject( jqXHR, textStatus, errorThrown );
                },
                statusCode: {
                    404: function() {

                        $.ajax( {
                            url: 'https://api.github.com/user/repos',
                            method: 'GET',
                            headers: self._headers,
                            contentType: "application/json",
                            data: {
                                name: self.params.repository_name,
                                has_issues: true,
                                has_wiki: false,
                            },
                            success: resolve,
                            error: reject,
                        } );

                    },
                },
            } );
            
        } );
        
        self.milestone = new Promise( ( resolve, reject ) => {
            
            self.connection.then( function() {
                
                $.ajax( {
                    url: self._github_repos_url + '/milestones',
                    method: 'GET',
                    headers: self._headers,
                    success: function( data ) {

                        var milestone = data.filter( m => m.title === self.params.encrypt( self.params.db_name ) );
                        
                        if (milestone.length > 0)
                            return resolve( milestone[0] );

                        else
                            
                            $.ajax( {
                                url: self._github_repos_url + '/milestones',
                                method: 'POST',
                                headers: self._headers,
                                data: JSON.stringify( {
                                    title: self.params.encrypt( self.params.db_name ),
                                } ),
                                contentType: 'application/json',
                                success: resolve,
                                error: reject,
                            } );
                        
                    },
                    error: reject,
                } );
                
            } ).catch( reject );
            
        } );
        
    };
    
    var Collection = function( name, ges ) {
        
        var self = this;
        
        self.name = name;
        self.ges = ges;
        
    };
    
    $.extend( {
        
        githubEncryptedStorage: function( github_username, github_password, options ) {
            
            if ( !github_username )
                throw new Error( 'Username must not be empty' );
            if ( !github_password )
                throw new Error( 'Password must not be empty' );
        
            var params = $.extend( {
                base64: true,
                db_name: 'default',
                decrypt: cyphertext => cyphertext,
                encrypt: cleartext => cleartext,
                repository_name: 'GES_database',
            }, options );
            
            return new GES( github_username, github_password, params )
        },
        
    } );
    
    GES.prototype.getCollection = function( collectionName ) {
        
        if ( /^\w+$/i.test( collectionName ) )
            return new Collection( collectionName, this );
        
        throw new Error( 'Collection name should only contain letters, numbers and underscores: ' + collectionName );
        
    };
    
    Collection.prototype.find = function() {
        
        var self = this;
        
        return new Promise( ( resolve, reject ) => {
	
            self.ges.milestone.then( function( milestone ) {

                var docs = [];

                var get_issues = function( next_page ) {

                   return _get_issues_page( self, milestone, next_page ).then( function( response ) {
                       
                       response.issues.reduce( function( all_docs, issue ) {
                           
                           all_docs.push( _issue_2_doc( self, issue ) );
                           
                           return all_docs;
                           
                       }, docs );

                       var link = response.req.getResponseHeader('Link');

                       if ( link ) {

                           var next_link = link.split( ', ' ).filter( function( link ) {
                               return link.includes( 'rel="next"' );
                           } );

                           // No more pages
                           if ( next_link.length <= 0 )
                               return resolve( docs );

                           var page_regex = /[^_]page=(\d+)/g,
                               next_page = page_regex.exec( next_link )[1];

                           return get_issues( parseInt( next_page ) );

                       }

                       resolve( docs );

                   } )
                   .catch( reject );

                };

                return get_issues( 0 );

            } ).catch( reject );
            
        } );
        
    };
    
    Collection.prototype.insert = function( docs ) {
        
        var self = this;
        
        return new Promise( ( resolve, reject ) => {
            
            self.ges.milestone.then( function( milestone ) {
                
                var create_promises = [],
                    new_docs = [];
                
                if ( !( docs instanceof Array ) )
                    docs = [ docs ];
                
                $.each( docs, ( i, doc ) => {
                    
                    create_promises.push( new Promise( ( inner_resolve, inner_reject ) => {
                        
                        $.ajax( {
                            url: self.ges._github_repos_url + '/issues',
                            method: 'POST',
                            headers: self.ges._headers,
                            data: JSON.stringify( {
                                title: self.ges.params.encrypt( Math.floor((Math.random() * 100) + 1) ),
                                body: self.ges.params.encrypt( JSON.stringify( doc ) ),
                                labels: self.ges.params.encrypt( JSON.stringify( {
                                    db_name: self.ges.params.db_name,
                                    label: self.name,
                                } ) ),
                                milestone: milestone.number,
                            } ),
                            contentType:"application/json",
                            success: ( issue, status, req ) => {
                                new_docs.push( _issue_2_doc( self, issue ) );
                                return inner_resolve( { issue: issue, status: status, req: req } );
                            },
                            error: inner_reject,
                        } );
                        
                    } ) );
                    
                } );
                
                Promise.all( create_promises ).then( _ => resolve( new_docs ) ).catch( reject );
                
            } ).catch( reject );
	
        } );
    };
    
    Collection.prototype.remove = function( docs ) {
        
        var self = this;
        
        return new Promise( ( resolve, reject ) => {
            
            self.ges.milestone.then( function( milestone ) {
                
                var patch_promises = [];
                
                if ( !( docs instanceof Array ) )
                    docs = [ docs ];
                
                $.each( docs, ( i, doc ) => {
                
                    patch_promises.push( _patch_issue( self, doc, true ) );
                    
                } );
                
                Promise.all( patch_promises ).then( resolve ).catch( reject );
                
            } ).catch( reject );
            
        } );
        
    };
    
    Collection.prototype.update = function( docs ) {
        
        var self = this;
        
        return new Promise( ( resolve, reject ) => {
            
            self.ges.milestone.then( function( milestone ) {
                
                var update_promises = [],
                    updated_docs = [];
                
                if ( !( docs instanceof Array ) )
                    docs = [ docs ];
                
                $.each( docs, ( i, doc ) => {
                
                    var update_promise = _patch_issue( self, doc, true );
                    update_promise.then( result => {
                        updated_docs.push( _issue_2_doc( self, result.issue ) )
                    } ).catch( _ => _ );
                    update_promises.push( update_promise );
                    
                } );
                
                Promise.all( update_promises ).then( _ => resolve( updated_docs ) ).catch( reject );
                
            } ).catch( reject );
            
        } );
        
    };
    
    
    
    var _get_issues_page = function( collection, milestone, page ) {
        
        var self = collection;

        var data = {
            milestone: milestone.number,
            per_page: 100,
            page: page,
            labels: self.ges.params.encrypt( JSON.stringify( {
                app_name: self.ges.params.db_name,
                label: collection.name,
            } ) ),
        };

        return new Promise( ( resolve, reject ) => {

                $.ajax( {
                    url: self.ges._github_repos_url + '/issues',
                    method: 'GET',
                    headers: self.ges._headers,
                    contentType: "application/json",
                    data: data,
                    success: ( issues, status, req ) => resolve( { issues: issues, status: status, req: req } ),
                    error: reject,
                } );

        } );

    };
    
    var _issue_2_doc = function( collection, issue ) {
        var doc = JSON.parse( collection.ges.params.decrypt( issue.body ) );
        doc.$id = issue.number;
        return doc;
    };
    
    var _patch_issue = function( collection, issue, close=false ) {
        
        var self = collection;
        
        return new Promise( ( resolve, reject ) => {
            
            var number = issue.$id;
            delete issue.$id;

            $.ajax( {
                url: self.ges._github_repos_url + '/issues/' + number,
                method: 'PATCH',
                headers: self.ges._headers,
                data: JSON.stringify( {
                    body: self.ges.params.encrypt( JSON.stringify( issue ) ),
                    state: close ? 'closed' : 'open',
                } ),
                contentType:"application/json",
                success: ( issue, status, req ) => resolve( { issue: issue, status: status, req: req } ),
                error: reject,
            } );
            
        } );
        
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
            
            stringified = decrypted.toString(CryptoJS.enc.Utf8);
        } else {
            stringified = window.atob( stringified );
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
            return window.btoa( stringified );

    	var key128Bits = CryptoJS.PBKDF2(this.options.encryption_passphrase, CryptoJS.enc.Hex.parse(this.options.app_name), { keySize: 128/32 });
        var encrypted = CryptoJS.AES.encrypt(stringified, key128Bits, { iv: CryptoJS.enc.Hex.parse(this.options.app_name) });
        
        return encrypted.toString();
        
    };
    
    GithubEncryptedStorage.prototype.objects = function (labels_filter, state) {
        
        var issuePromise = $.Deferred();

        var self = this;

        var data = {
            per_page: 100,
        };
	    
	if ( state !== undefined )
	    data.state = state;

        if ( typeof( labels_filter ) !== 'undefined' && labels_filter.length > 0 )
            data.labels = labels_filter.map( function( l ) { 
                return self.encrypt( {
                    app_name: self.options.app_name,
                    label: l,
                } ); 
            } ).join( ',' );
        
        var all_objects = [];
        
        function get_next_objects_page( page ) {
            
            self.milestone.then(function(milestone) {
                data.milestone = milestone.number;
                data.page = page;

                $.ajax({
                    url: self._github_repos_url + '/issues',
                    method: 'GET',
                    headers: { Authorization: self._basic_auth_string },
					contentType: "application/json",
                    data: data,
                    success: function(issues,textStatus, req) {
                    
                        issues.reduce( function( all, issue ) {
                            all.push( {
                                id: issue.number,
                                json: self.decrypt(issue.body),
                                labels: issue.labels.map(function (l) { l.name = self.decrypt(l.name).label; return l; }),
                            } );
                            return all
                        }, all_objects );

                        var link = req.getResponseHeader('Link');

                        if ( link ) {

                            var next_link = link.split( ', ' ).filter( function( link ) {
                                return link.includes( 'rel="next"' );
                            } );

                            // No more pages
                            if ( next_link.length <= 0 )
                                return issuePromise.resolve( all_objects );

                            var page_regex = /[^_]page=(\d+)/g,
                                next_page = page_regex.exec( next_link )[1];

                            return get_next_objects_page( next_page );

                        }

                        return issuePromise.resolve( all_objects );

                    },
                    error: function(e) {
                        issuePromise.reject('Error while contacting Github API', e);
                    },
                });

            }, function(e) {
                issuePromise.reject('Error while contacting Github API', e);
            });
            
        }
        
        get_next_objects_page( 0 );
        
        return issuePromise.promise();
    };
    
    GithubEncryptedStorage.prototype.labels = function () {
        var labelsPromise = $.Deferred();
        
        let self = this;
        
        $.ajax({
            url: this._github_repos_url + '/labels',
            method: 'GET',
			headers: { Authorization: this._basic_auth_string },
            success: function(data) {
                labelsPromise.resolve(data.reduce(function(prev, l) {
                    try {
                        prev.push( {
                            name: self.decrypt(l.name).label,
                            color: l.color
                        } );
                    } catch (e) {}

                    return prev;
                }, []));
            },
            error: function(e) {
                labelsPromise.reject('Error while contacting Github API', e);
            },
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
		    success: function(data) {
                var milestone = data.filter(function(m) {
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
                        contentType:"application/json",
                        success: function(data) {
                            milestonePromise.resolve(data);
                        },
                        error: function(e) {
                            milestonePromise.reject(e);
                        },
                    });
                }
		    },
            error: function(e) {
                milestonePromise.reject(e);
            },
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
		    success: function(data) {
                issuePromise.resolve('success');
            },
            error: function(e) {
                issuePromise.reject('Error while contacting Github API', e);
            },
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
					contentType:"application/json",
                    success: function(data) {
                        issuePromise.resolve('success');
                    },
                    error: function(e) {
                        issuePromise.reject('Error while contacting Github API', e);
                    },
				});
			} else {
				req = $.ajax({
					url: self._github_repos_url + '/issues/' + existing_id,
					method: 'PATCH',
					headers: { Authorization: self._basic_auth_string },
					data: JSON.stringify({
						body: self.encrypt(json_object),
						labels: labels ? labels : [],
						state: 'open',
					}),
					contentType:"application/json",
                    success: function(data) {
                        issuePromise.resolve('success');
                    },
                    error: function(e) {
                        issuePromise.reject('Error while contacting Github API', e);
                    },
				});
			}
		});
        
        return issuePromise.promise();
    };
	
	return function ( options ) {
        return new GithubEncryptedStorage( options );
    }
	
}( jQuery ) );
