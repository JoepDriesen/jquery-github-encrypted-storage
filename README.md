# jquery-github-encrypted-storage
A jQuery plugin that uses a Github repository issues tracker to store JSON objects

## Installation

Include script *after* the jQuery and CryptoJS library:

```html
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

The username of a user that has read/write access to the issue list of the repository you would like to use

## Contributing

All pull requests welcome

## Authors

[Joep Driesen](https://github.com/JoepDriesen)
