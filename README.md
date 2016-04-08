# jquery-github-encrypted-storage
A jQuery plugin that uses a Github repository issues tracker to store JSON objects

## Installation

Include script *after* the jQuery and CryptoJS-AES library:

```html
<script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/js/bootstrap.min.js" integrity="sha384-0mSbJDEHialfmuBBQP6A4Qrprq5OVfW37PRR3j5ELqxss1yVqOtnepnHVP9aJ7xS" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/3.1.2/rollups/aes.js"></script>
<script src="/path/to/jquery.github-encrypted-storage.js"></script>
```

## Usage

Create a storage object:

```javascript
var gh_storage = $.githubEncryptedStorage({
  github_username: 'placeholder',
  github_password: 'secret',
  github_repo: 'issue_repo',
  
  encryption_passphrase: 'secret2'
});
```

Get all objects from storage in the form of a jQuery promise:

```javascript
var objectsPromise = gh_storage.objects();

$.when ( objectsPromise ).then(function(objects) {
  console.log(objects);
});
```

Save objects to storage

```javascript
gh_storage.saveObject({
  key: 'value'
});
```

## Options

### github_username

The github username of a user that owns the repository you would like to use.

### github_password

The github password corresponding to the username above.

### github_repo

The name of the repository you would like to use.

### encryption_passphrase

This is a string containing the passphrase that will be used by the CryptoJS AES library to encrypt your objects
when saving them in the github Issue Tracker. 

If this value is empty, no encryption will be used.

## API

### objects(labels)

Returns a [jQuery promise](https://api.jquery.com/deferred.promise/) of all the objects stored in the 
Github Issue Tracker.

The parameter `labels` should be a list of string, corresponding to labels in the Issue Tracker. If this 
parameters is provided, only objects that are tagged with all the given labels will be returned.

The following snippet will print a list of all objects to the console:
```javascript
var objectPromise = gh_storage.objects();

$.when( objectPromise ).then(function(objects) {
	console.log(objects);
})
```

The following snippet will print a list of objects tagged with the label `bug` to the console:
```javascript
var objectPromise = gh_storage.objects(['bug']);

$.when( objectPromise ).then(function(objects) {
	console.log(objects);
})
```

Objects have the following structure:
```javascript
var object = {
	id: 1,
	json: {
		key: 'value'
	}
	labels: ['label1', 'label2'],
}
```

### saveObject(object, labels, existing_id)

Returns a [jQuery promise](https://api.jquery.com/deferred.promise/) indicating if the object was successfully 
save to the Github Issue Tracker.

The parameter `object` should be the json object (it will be `JSON.stringify`-ed) you would like to store.

The optional parameter `labels` should be a list of strings containing all the labels this object should be 
tagged with. If a label does not exist, it will be created.
If not provided, the object will not be tagged.

The optional parameter `existing_id` is the id of the object you would like to update with the given information.
If not provided, a new object will be created.

The following snippet creates a new object tagged with the label `bug`:
```javascript
gh_storage.saveObject({
	testKey: 'testValue'
}, ['bug']);
```

The following snippet updates an existing object and checks if this was successfull:
```javascript
var objectPromise = gh_storage.saveObject({
	testKey: 'testValue'
}, [], 13);

$.when( objectPromise ).then(function(status) {
	console.log('Object saved successfully');
}, function(status) {
	console.log('Failed to save object');
});
```

### labels()

Returns a [jQuery promise](https://api.jquery.com/deferred.promise/) of all labels currently in the 
Github Issue Tracker.

The following snippet will print a list of all labels to the console:
```javascript
var labelsPromise = gh_storage.labels();

$.when( labelsPromise ).then(function(labels) {
	console.log(labels);
})
```

`label` objects have the following structure:

```javascript
var label = {
	name: 'nameOfLabel',
	color: 'ffffff',
	url: 'https://api.github...'
}
```



## Contributing

All pull requests welcome

## Authors

[Joep Driesen](https://github.com/JoepDriesen)
