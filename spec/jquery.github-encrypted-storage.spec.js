describe( "GES", function() {
    
    it( "API test", function( done ) {
        
        var db = $.githubEncryptedStorage( 'JoepDriesen', 'o3p09825YOK8C5R7sCpJ', {
            repository_name: 'Database',
            db_name: 'Default',
            decrypt: function( cypher_text ) {

                var key128Bits = CryptoJS.PBKDF2( 'secret', CryptoJS.enc.Hex.parse('Default'), { keySize: 128/32 } );
                var decrypted = CryptoJS.AES.decrypt( cypher_text, key128Bits, { iv: CryptoJS.enc.Hex.parse('Default') } );

                return decrypted.toString(CryptoJS.enc.Utf8);

            },
            encrypt: function( cleartext ) {

                var key128Bits = CryptoJS.PBKDF2( 'secret', CryptoJS.enc.Hex.parse('Default'), { keySize: 128/32 } );
                var encrypted = CryptoJS.AES.encrypt( cleartext, key128Bits, { iv: CryptoJS.enc.Hex.parse('Default') } );

                return encrypted.toString();

            },
        } );
        
        db.getCollection( 'category' ).find().then( function( cats ) {
            done();
		}).catch( done.fail );
        
        expect( 0 ).toEqual( 0 );
        
    } );
    
    describe( "constructor", function() {
        
        beforeAll( function() {
            this.ajax_spy = spyOn( $, 'ajax' );
        } );
        
        it( "should return an error if any credentials are missing", function() {
            
            expect( _ => $.githubEncryptedStorage() ).toThrowError( 'Username must not be empty' );
            expect( _ => $.githubEncryptedStorage( 'username' ) ).toThrowError( 'Password must not be empty' );
            expect( _ => $.githubEncryptedStorage( 'username', 'password' ) ).not.toThrowError();
            
        } );
        
        it( "should return different objects for every constructor", function() {
            
            var db1 = $.githubEncryptedStorage( 'test', 'test' );
            var db2 = $.githubEncryptedStorage( 'test', 'test' );
            
            expect( db1 ).not.toEqual( db2 );
            
        } );
        
        it( "should check if the database repository exists, and if not, create it", function( done ) {
            
            var self = this;
            
            self.repos_call = jasmine.createSpy( 'repos_call' );
            self.repos_call.and.callFake( o => o.success() );
            self.create_repo_call = jasmine.createSpy( 'create_repo_call' );
            self.create_repo_call.and.callFake( o => o.success() );
            self.ajax_spy.and.callFake( options => {
                
                if ( options.url.endsWith( '/repos/testuser/existing_repo' ) )
                    return self.repos_call( options );
                
                if ( options.url.endsWith( '/repos/testuser/non_existing_repo' ) )
                    return options.statusCode['404']();
                
                if ( options.url.endsWith( '/user/repos' ) )
                    return self.create_repo_call( options );
                
                if ( options.url.endsWith( '/milestones' ) )
                    return options.success( [] );

                throw new Error( options.url );
                
            } );
            
            var db = $.githubEncryptedStorage( 'testuser', 'testpw', {
                repository_name: 'existing_repo'
            } );
            
            db.connection.then( function() {
            
                expect( self.repos_call ).toHaveBeenCalled();
                expect( self.create_repo_call ).not.toHaveBeenCalled();
                
                var db2 = $.githubEncryptedStorage( 'testuser', 'testpw', {
                    repository_name: 'non_existing_repo'
                } );

                db2.connection.then( function() {
                    
                    expect( self.repos_call.calls.count() ).toEqual( 1 );
                    expect( self.create_repo_call ).toHaveBeenCalled();
                    
                    done();
                    
                } ).catch( done.fail );
                
            } ).catch( done.fail );
            
        } );
        
        it( "should check if a milestone for the database exists, and if not, create it", function( done ) {
            
            var self = this;
            
            self.milestones_call = jasmine.createSpy( 'milestones_call' );
            self.milestones_call.and.callFake( ( o, d ) => o.success( d ) );
            self.create_milestone_call = jasmine.createSpy( 'create_milestone_call' );
            self.create_milestone_call.and.callFake( o => o.success() );
            self.ajax_spy.and.callFake( options => {
                
                if ( options.url.endsWith( '/repos/testuser/testrepo' ) )
                    return options.success();
                
                if ( options.url.endsWith( '/milestones' ) ) {
                    
                    if ( options.method == 'GET' )
                        return self.milestones_call( options, [ { title: 'existing_db' } ] );
                    
                    if ( options.method == 'POST' )
                        return self.create_milestone_call( options );
                    
                }
                
                throw new Error( options.url );
                
            } );
            
            var db = $.githubEncryptedStorage( 'testuser', 'testpw', {
                repository_name: 'testrepo',
                db_name: 'existing_db',
            } );
            
            db.milestone.then( function() {
                
                expect( self.milestones_call ).toHaveBeenCalled();
                expect( self.create_milestone_call ).not.toHaveBeenCalled();

                var db2 = $.githubEncryptedStorage( 'testuser', 'testpw', {
                    repository_name: 'testrepo',
                    db_name: 'non_exisiting_db',
                } );
                
                db2.milestone.then( function() {

                    expect( self.milestones_call.calls.count() ).toEqual( 2 );
                    expect( self.create_milestone_call ).toHaveBeenCalled();
                    
                    done();
                    
                } ).catch( done.fail );
                
            } ).catch( done.fail );
            
        } );
        
    } );
    
    describe( "milestone", function() {
        
        beforeAll( function() {
            this.ajax_spy = spyOn( $, 'ajax' );
        } );
        
        it( "should return the milestone when the promise is resolved", function( done ) {
            
            var self = this;
            
            self.ajax_spy.and.callFake( options => {
                if ( options.url.endsWith( '/repos/testuser/testrepo' ) )
                    return options.success();
                if ( options.url.endsWith( '/milestones' ) )
                    return options.success( [ 
                        { title: 'testdb1', number: 5 }, 
                        { title: 'testdb2', number: 3 }, 
                        { title: 'testdb3', number: 7 } ] );
                throw new Error( options.url );
            } );
            
            var db = $.githubEncryptedStorage( 'testuser', 'testpw', {
                repository_name: 'testrepo',
                db_name: 'testdb2',
            } );
            
            db.milestone.then( function( milestone ) {
                
                expect( milestone.number ).toEqual( 3);
                
                done();
            
            } ).catch( done.fail );
            
        } );
        
    } );
    
    describe( "getCollection", function() {
        
        beforeAll( function( done ) {
            
            var self = this;
            
            self.ajax_spy = spyOn( $, 'ajax' );
            
            $( function() {

                self.db = $.githubEncryptedStorage( 'test', 'test', 'test' );
                
                done();

            } );
            
        } );
        
        it( "should return an object", function() {
            
            var self = this;
            
            expect( self.db.getCollection( 'test' ) ).not.toEqual( undefined );
            
        } );
        
    } );
    
} );

describe( "Collection", function() {
        
    beforeAll( function() {

        var self = this;

        self.ajax_spy = spyOn( $, 'ajax' );
        self.ajax_spy.and.callFake( options => {
            if ( options.url.endsWith( '/repos/baduser/testrepo' ) )
                return options.error( { status: 401 } );
            if ( options.url.endsWith( '/repos/testuser/testrepo' ) )
                return options.success();
            if ( options.url.endsWith( '/milestones' ) )
                return options.success( [ { title: 'testdb' } ] );
            throw new Error( options.url );
        } );

        self.db = $.githubEncryptedStorage( 'testuser', 'testpw', {
            repository_name: 'testrepo',
            db_name: 'testdb',
        } );

    } );
    
    describe( "find", function() {
        
        it( "should fail if the connection to GitHub failed.", function( done ) {

            var self = this;
            
            var db = $.githubEncryptedStorage( 'baduser', 'testpw', {
                repository_name: 'testrepo',
                db_name: 'testdb',
            } );
            
            db.getCollection( 'test' ).find()
                .then( done.fail )
                .catch( function( e ) {
                    expect( e.status ).toEqual( 401 );
                    done();
                } );
            
        } );
        
        it( "should return the documents if successfull.", function( done ) {

            var self = this;
	    
            self.ajax_spy.and.callFake( options => {
                if ( options.url.endsWith( '/issues' ) )
                    return options.success( [ 
                        { number:0, body:'{}' }, 
                        { number:1, body:'{}' }, 
                        { number:2, body:'{}' }, 
                    ], undefined, { getResponseHeader: _ => _ } );
                throw new Error( options.url );
            } );
            
            self.db.getCollection( 'test' ).find()
                .then( function( docs ) {

                    expect( docs.length ).toEqual( 3 );

                    done();

                } )
                .catch( done.fail );
            
        } );
        
        it( "should return only return the documents of this collection.", function( done ) {

            var self = this;
	    
            self.ajax_spy.and.callFake( options => {
                if ( options.url.endsWith( '/issues' ) ) {
                    expect( options.data.labels ).toEqual( JSON.stringify( {
                        app_name: 'testdb',
                        label: 'testcollection',
                    } ) );
                    return options.success( [ 
                        { number:0, body:'{}' }, 
                        { number:1, body:'{}' }, 
                        { number:2, body:'{}' }, 
                    ], undefined, { getResponseHeader: _ => _ } );
                }
                throw new Error( options.url );
            } );
            
            self.db.getCollection( 'testcollection' ).find()
                .then( function( docs ) {

                    expect( docs.length ).toEqual( 3 );

                    done();

                } )
                .catch( done.fail );
            
        } );
        
        it( "should handle pagination correctly.", function( done ) {

            var self = this;
	    
            self.ajax_spy.and.callFake( options => {
                if ( options.url.endsWith( '/issues' ) ) {
                    return options.success( [ 
                        { number:0, body:'{}' }, 
                        { number:1, body:'{}' }, 
                        { number:2, body:'{}' }, 
                    ], null, {
                        getResponseHeader: function() {
                            if ( options.data.page >= 1 )
                                return 'Link: <' + options.url + '?page=0&per_page=100>; rel="first", ' + options.url + '?page=0&per_page=100>; rel="prev"';
                            
                            return 'Link: <' + options.url + '?page=1&per_page=100>; rel="next", ' + options.url + '?page=1&per_page=100>; rel="last"'
                        },
                    } );
                }
                throw new Error( options.url );
            } );
            
            self.db.getCollection( 'testcollection' ).find()
                .then( function( docs ) {

                    expect( docs.length ).toEqual( 6 );

                    done();

                } )
                .catch( done.fail );
            
        } );
        
        it( "should return the content of the documents.", function( done ) {

            var self = this;
	    
            self.ajax_spy.and.callFake( options => {
                if ( options.url.endsWith( '/issues' ) )
                    return options.success( [ {
                        number: 10,
                        title: 1,
                        body: JSON.stringify( {
                            testkey: 'testvalue',
                        } ),
                        labels: [ 'testlabel' ],
                    } ], undefined, { getResponseHeader: _ => _ } );
                throw new Error( options.url );
            } );
            
            self.db.getCollection( 'test' ).find()
                .then( function( docs ) {

                    expect( docs[0] ).toEqual( {
                        $id: 10,
                        testkey: 'testvalue',
                    } );

                    done();

                } )
                .catch( done.fail );
            
        } );
        
    } );
    
    describe( "insert", function() {
        
        it( "should open an issues with the given parameters.", function( done ) {

            var self = this;
	    
            self.ajax_spy.and.callFake( options => {
                if ( options.url.endsWith( '/issues' ) && options.method === 'POST' )
                    return options.success( JSON.parse( options.data ), null, { getResponseHeader: _ => _ } );
                throw new Error( options.url );
            } );
            
            self.db.getCollection( 'testcollection' ).insert( {
                testkey: 'testvalue',
            } ).then( function( new_docs ) {
                console.log(new_docs)
                expect( new_docs.length ).toEqual( 1 );
                expect( new_docs[0].testkey ).toEqual( 'testvalue' );

                done();

            } ).catch( done.fail );
            
        } );
        
        it( "should support opening multiple issues.", function( done ) {

            var self = this;
	    
            self.ajax_spy.and.callFake( options => {
                if ( options.url.endsWith( '/issues' ) && options.method === 'POST' )
                    return options.success( JSON.parse( options.data ), null, { getResponseHeader: _ => _ } );
                throw new Error( options.url );
            } );
            
            self.db.getCollection( 'testcollection' ).insert( [ {
                testkey: 'testvalue',
            }, {
                testkey: 'testvalue2',
            } ] ).then( function( new_docs ) {

                expect( new_docs.length ).toEqual( 2 );

                done();

            } ).catch( done.fail );
            
        } );
        
    } );
    
    describe( "remove", function() {
        
        it( "should remove an issues with the given id.", function( done ) {

            var self = this;
	    
            var remove_call = jasmine.createSpy( 'remove_call' );
            remove_call.and.callFake( options => {
                return options.success( null, null, null );
            } );
            self.ajax_spy.and.callFake( options => {
                if ( options.url.endsWith( '/issues/20' ) && options.method === 'PATCH' )
                    return remove_call( options );
                throw new Error( options.url );
            } );
            
            self.db.getCollection( 'testcollection' ).remove( {
                $id: 20,
            } ).then( _ => {
            
                expect( remove_call ).toHaveBeenCalledTimes( 1 );
                
                done();
            
            } ).catch( done.fail );
            
        } );
        
        it( "should support removing multiple issues.", function( done ) {

            var self = this;
	    
            var remove_call = jasmine.createSpy( 'remove_call' );
            remove_call.and.callFake( options => {
                return options.success( null, null, null );
            } );
            self.ajax_spy.and.callFake( options => {
                if ( options.url.endsWith( '/issues/14' ) && options.method === 'PATCH' )
                    return remove_call( options );
                if ( options.url.endsWith( '/issues/10' ) && options.method === 'PATCH' )
                    return remove_call( options );
                throw new Error( options.url );
            } );
            
            self.db.getCollection( 'testcollection' ).remove( [ {
                $id: 14,
            }, {
                $id: 10,
            } ] ).then( _ => {
            
                expect( remove_call ).toHaveBeenCalledTimes( 2 );
                
                done();
            
            } ).catch( done.fail );
            
        } );
        
    } );
    
    describe( "update", function() {
        
        it( "should update the issue with the given id with the given parameters.", function( done ) {

            var self = this;
	    
            var update_call = jasmine.createSpy( 'update_call' );
            update_call.and.callFake( options => {
                return options.success( JSON.parse( options.data ), null, null );
            } );
            self.ajax_spy.and.callFake( options => {
                if ( options.url.endsWith( '/issues/20' ) && options.method === 'PATCH' )
                    return update_call( options );
                throw new Error( options.url );
            } );
            
            self.db.getCollection( 'testcollection' ).update( {
                $id: 20,
                testkey: 'testvalue2',
            } ).then( function( new_docs ) {

                expect( new_docs.length ).toEqual( 1 );
                expect( new_docs[0].testkey ).toEqual( 'testvalue2' );
                expect( update_call ).toHaveBeenCalledTimes( 1 );

                done();

            } ).catch( done.fail );
            
        } );
        
        it( "should support updating multiple issues.", function( done ) {

            var self = this;
	    
            var update_call = jasmine.createSpy( 'update_call' );
            update_call.and.callFake( options => {
                return options.success( JSON.parse( options.data ), null, null );
            } );
            self.ajax_spy.and.callFake( options => {
                if ( options.url.endsWith( '/issues/14' ) && options.method === 'PATCH' )
                    return update_call( options );
                if ( options.url.endsWith( '/issues/10' ) && options.method === 'PATCH' )
                    return update_call( options );
                throw new Error( options.url );
            } );
            
            self.db.getCollection( 'testcollection' ).update( [ {
                $id: 14,
                testkey: 'testvalue',
            }, {
                $id: 10,
                testkey: 'testvalue2',
            } ] ).then( function( updated_docs ) {

                expect( updated_docs.length ).toEqual( 2 );
                expect( update_call ).toHaveBeenCalledTimes( 2 );
                
                done();
                
            } ).catch( done.fail );
            
        } );
        
    } );
    
} );