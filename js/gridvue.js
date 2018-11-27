var albumBucketName = 'leilaphotos';
var albumBucketNameThumb = 'leilaphotosthumb';
var bucketRegion = 'eu-west-1';
var IdentityPoolId = 'eu-west-1:2f189814-9f5a-4658-b248-560faa9747e8';

var CognitoAuth = AmazonCognitoIdentity.CognitoAuth;
	
var authData = {
  ClientId : 'emvliumkmno2khq73lhcuebsk', // Your client id here
  AppWebDomain : 'leilaphotos.auth.eu-west-1.amazoncognito.com',
  TokenScopesArray : ['email', 'openid'], 
  RedirectUriSignIn : RedirectUriSignIn,
	RedirectUriSignOut : RedirectUriSignOut
};

var auth = new AmazonCognitoIdentity.CognitoAuth(authData);

AWS.config.region = bucketRegion;

auth.userhandler = {
  onSuccess: function (result) {
    console.log("Signing in success");
    console.log(result);
  },
  onFailure: function (err) {
    alert("Error!");
  }
};

if (window.location.hash.length>1) {  //there is something in the URL so inspect it
  var curUrl = window.location.href;
  auth.parseCognitoWebResponse(curUrl);
}


var s3=null;  //create a global variable, but don't set it until you have all the credentials to access S3

Vue.component('confirm-button', {
  props: ['label', 'pkey', 'action'],
  methods: {
    onclick: function () {
      console.log(this.pkey, this.action);
      if (confirm("Are you sure?")) {
        
        if (this.action == 'photo'){
          console.log("deleting photo ", this.pkey)
          gridvue.deletePhoto(this.pkey);
        }
        if (this.action == 'album'){
          console.log("deleting album ", this.pkey)
          gridvue.deleteAlbum(this.pkey);
        }
      }
    }
  },
  template: `
  <button type="button" class="btn btn-primary" @click="onclick()">{{ label }}</button>
  `
})

Vue.component('photo-item', {
  props: ['url', 'pkey', 'action', 'thumburl'],
  template: `
    <div class="grid-item">
      <a :href="url" target="_blank"> <img :src="thumburl"></a>
      <confirm-button label="Delete" :action="action" :pkey="pkey"></confirm-button>
    </div>
  `
})

var gridvue = new Vue({
    el: '#gridvue',
    data: {
      albumNames: [],
      photoUrls: [],
      currentAlbum: "",
      displayingAlbums: true,
      displayingPhotos: false,
      pointer: 0,
      markers: [],
      endReached: false,
      signedIn: false,
      uploading: false,
      upCounter: 0

    },
    mounted: function(){
      if (auth.isUserSignedIn(auth.getCurrentUser())){
        console.log("User is signed in");
        this.signedIn= true;
        AWS.config.credentials = new AWS.CognitoIdentityCredentials({
          IdentityPoolId: IdentityPoolId,
          Logins: {
            'cognito-idp.eu-west-1.amazonaws.com/eu-west-1_Y9jF6Qx5c': auth.signInUserSession.getIdToken().getJwtToken()
          }
        });
        AWS.config.credentials.get();

        s3 = new AWS.S3({
          apiVersion: '2006-03-01'
          // params: {Bucket: albumBucketName}
        });
      }
      else {
        console.log("user is signed out");
        this.signedIn = false;
      }
    },

    methods: {
      clear: function() {
        gridvue.albumNames = [];
        gridvue.photoUrls = [];
      },
      listAlbums: function () {
        this.clear();
        this.displayingPhotos=false;
        this.displayingSingle=false;
        this.displayingAlbums=true;

        s3.listObjects({Delimiter: '/', Bucket: albumBucketName}, function(err, data) {
          if (err) {
            return alert('There was an error listing your albums: ' + err.message);
          } else {
            var albums = data.CommonPrefixes.map(function(commonPrefix) {
              var prefix = commonPrefix.Prefix;
              var albumName = decodeURIComponent(prefix.replace('/', ''));
              gridvue.albumNames.push(albumName);
              console.log(albumName);
            })
          }
        })
      },
      viewAlbum: function(albumName, direction) {
        this.clear();
        this.displayingPhotos=true;
        this.displayingAlbums=false;
        this.displayingSingle=false;
        gridvue.photoUrls =[];
        gridvue.currentAlbum = albumName; 
        console.log('looking at ', gridvue.currentAlbum);
        console.log("direction is ", direction);
        var albumPhotosKey = encodeURIComponent(albumName) + '/';
        if (direction == 'stt'){
          gridvue.pointer = -1;
          gridvue.markers = [];
        };
        if (direction =='bck'){
          gridvue.pointer -= 2;
        }
        if (direction =='del'){
          gridvue.pointer -=1;
        }
        var params = {
          Bucket: albumBucketNameThumb,
          Prefix: albumPhotosKey,
          Marker: gridvue.markers[gridvue.pointer],
          Delimiter: '~',
          MaxKeys: 25
        };
        s3.listObjects(params, function(err, data) {
          if (err) {
            return alert('There was an error viewing your album: ' + err.message);
          }
          // `this` references the AWS.Response instance that represents the response
          console.log("data is ", data);
          var href = this.request.httpRequest.endpoint.href;
          var bucketUrl = href + albumBucketName + '/';
          var bucketUrlThumb = href + albumBucketNameThumb + '/';

          // now basically checking whether we need to add more data to the array.. only if pointer is at the end 
          // of the array.. otherwise we already have the next page element in the array
          // and only if ISTruncated because otherwise we have no more photos in the bucket
          if ((direction == "fwd" || direction == "stt") && (gridvue.pointer+1 == gridvue.markers.length) && data.IsTruncated ){
            gridvue.markers.push(data.NextMarker)
          };
          gridvue.pointer += 1;
          if (data.IsTruncated) {   //checking whether you are at the end of the list
            gridvue.endReached = false;
          } else {
            gridvue.endReached = true;
          }

          console.log("pointer is ", gridvue.pointer);
          console.log("markers are ", gridvue.markers)
      
          var photos = data.Contents.map(function(photo) {
            if (photo.Size >0) {  // try to avoid the weird folder "image"
              var photoKey = photo.Key;
              var photoUrl;
              var photoUrlThumb;
              //get signed urls for accessing the private images
              s3.getSignedUrl('getObject', {Bucket: albumBucketName, Key: photoKey}, function (err, url) {
                photoUrl = url;
                s3.getSignedUrl('getObject', {Bucket: albumBucketNameThumb, Key: photoKey}, function (err, url) {
                  photoUrlThumb = url;
                  gridvue.photoUrls.push({"url":photoUrl, "thumburl": photoUrlThumb, "key":photoKey});
                  console.log("eh!",photoUrl, photoUrlThumb, photoKey);
                });
              });
            };
          });
        })
      },
      createAlbum: function(albumName) {
        albumName = albumName.trim();
        if (!albumName) {
          return alert('Album names must contain at least one non-space character.');
        }
        if (albumName.indexOf('/') !== -1) {
          return alert('Album names cannot contain slashes.');
        }
        var albumKey = encodeURIComponent(albumName) + '/';
        var params = {Key: albumKey,
                       Bucket: albumBucketName};
        console.log("creating... ", params);
        s3.headObject(params, function(err, data) {
          if (!err) {
            return alert('Album already exists.');
          }
          if (err.code !== 'NotFound') {
            return alert('There was an error creating your album: ' + err.message);
          }
          s3.putObject(params, function(err, data) {
            if (err) {
              return alert('There was an error creating your album: ' + err.message);
            }
            alert('Successfully created album.');
            gridvue.viewAlbum(albumName,"stt");
          });
        });
      },

      deleteAlbum: function(albumName) {
        var albumKey = encodeURIComponent(albumName) + '/';
        //first do it for the actual images
        s3.listObjects({Prefix: albumKey, Bucket: albumBucketName}, function(err, data) {
          if (err) {
            return alert('There was an error finding your album for delete ', err.message);
          }
          console.log("data is ", data);
          var objects = data.Contents.map(function(object) {
            return {Key: object.Key};
          });
          console.log("objects is ", objects);
          s3.deleteObjects({
            Bucket: albumBucketName,
            Delete: {Objects: objects,  Quiet: true}
          }, function(err, data) {
            if (err) {
              return alert('There was an error deleting your album: ', err.message);
            }
            //then do it for the thumbnails
            s3.listObjects({Prefix: albumKey, Bucket: albumBucketNameThumb}, function(err, data) {
              if (err) {
                return alert('There was an error finding your album for delete ', err.message);
              }
              console.log("data is ", data);
              var objects = data.Contents.map(function(object) {
                return {Key: object.Key};
              });
              console.log("objects is ", objects);
              s3.deleteObjects({
                Bucket: albumBucketNameThumb,
                Delete: {Objects: objects,  Quiet: true}
              }, function(err, data) {
                if (err) {
                  return alert('There was an error deleting your album: ', err.message);
                }
                alert('Successfully deleted album.');
                gridvue.listAlbums();
              })
            })
          })
        })      
      },

      //this one uploads the photos to s3
      onFileChange(e) {
        var files = e.target.files || e.dataTransfer.files;
        if (!files.length)
          return;
        console.log("files are", files);
        gridvue.uploading = true;
        gridvue.upCounter = files.length;
        async.eachLimit(files,4, 
          function(file, callback){
            var fileName = file.name;
            var albumPhotosKey = encodeURIComponent(gridvue.currentAlbum) + '/';
            var photoKey = albumPhotosKey + fileName;
            console.log("photokey is ", photoKey);
            console.log("about to attempt ", fileName);
            console.log("file type is ", file.type);
            s3.upload({
              Bucket: albumBucketName,
               Key: photoKey,
               Body: file,
               ContentType: file.type,
               ACL: 'private'
            }, function(err, data) {
               if (err) {
                  gridvue.uploading = false;
                  return callback(err.message);
               }
               console.log("No error.", data)
               console.log(gridvue.upCounter--)
               callback();
            });
          },
          function(err) {
            console.log("Entered here and checking for errors");
            // if any of the file processing produced an error, err would equal that error
            if( err ) {
              // One of the iterations produced an error.
              // All processing will now stop.
              alert('A file failed to process', err);
              console.log("error!!", err)
              gridvue.viewAlbum(gridvue.currentAlbum,"stt");
            } else {
              alert('All files have been processed successfully');
              gridvue.uploading = false;
              gridvue.viewAlbum(gridvue.currentAlbum, "stt");
            }
          }
        );
      },

      deletePhoto: function (photoKey) {
        s3.deleteObject({Key: photoKey, Bucket:albumBucketName}, function(err, data) {
          if (err) {
            return alert('There was an error deleting your photo: ', err.message);
          }
          s3.deleteObject({Key: photoKey, Bucket:albumBucketNameThumb}, function(err, data) {
            if (err) {
              return alert('There was an error deleting your photo thumbnail: ', err.message);
            }
            alert('Successfully deleted photo.');
            gridvue.viewAlbum(gridvue.currentAlbum,"del");
          });
        });
      }
    


    }
})

