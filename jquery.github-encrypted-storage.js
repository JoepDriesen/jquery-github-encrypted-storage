( function ( $ ) {
    
    // Remove caching
    $.ajaxSetup( { cache: false } )
    
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

                        var milestone = data.filter( m => {
                            var decrypted = self.params.decrypt( m.title );
                            
                            return decrypted === self.params.db_name
                        } );
                        
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
    
    Collection.prototype.find = function( old_labels=false ) {
        
        var self = this;
        
        return new Promise( ( resolve, reject ) => {
	
            self.ges.milestone.then( function( milestone ) {

                var docs = [];

                var get_issues = function( next_page ) {

                   return _get_issues_page( self, milestone, next_page, old_labels ).then( function( response ) {
                       
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
                                title: self.ges.params.encrypt( String( Math.floor((Math.random() * 100) + 1) ) ),
                                body: self.ges.params.encrypt( JSON.stringify( doc ) ),
                                labels: [ self.ges.params.encrypt( JSON.stringify( {
                                    db_name: self.ges.params.db_name,
                                    label: self.name,
                                } ) ) ],
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
                
                    var update_promise = _patch_issue( self, doc, false );
                    update_promise.then( result => {
                        updated_docs.push( _issue_2_doc( self, result.issue ) )
                    } ).catch( _ => _ );
                    update_promises.push( update_promise );
                    
                } );
                
                Promise.all( update_promises ).then( _ => resolve( updated_docs ) ).catch( reject );
                
            } ).catch( reject );
            
        } );
        
    };
    
    
    
    var _get_issues_page = function( collection, milestone, page, old_labels=false ) {
        
        var self = collection;

        var data = {
            milestone: milestone.number,
            per_page: 100,
            page: page,
        };
        
        data.labels = self.ges.params.encrypt( JSON.stringify( {
                db_name: self.ges.params.db_name,
                label: collection.name,
            } ) );
        
        if ( old_labels )
            data.labels += ' ' + self.ges.params.encrypt( JSON.stringify( {
                app_name: self.ges.params.db_name,
                label: collection.name,
            } ) );
            

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
	
}( jQuery ) );
