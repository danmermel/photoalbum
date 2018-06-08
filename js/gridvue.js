var albumBucketName = 'leilaphotos';
var bucketRegion = 'eu-west-1';
var IdentityPoolId = 'eu-west-1:2f189814-9f5a-4658-b248-560faa9747e8';

AWS.config.update({
  region: bucketRegion,
  credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: IdentityPoolId
  })
});

var s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  params: {Bucket: albumBucketName}
});

Vue.component('confirm-button', {
  props: ['label', 'pkey', 'action'],
  methods: {
    onclick: function () {
      console.log(this.pkey, this.action);
      if (confirm("are you sure?")) {
        
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
  <button type="button" class="btn btn-primary" @click="onclick()">{{ label }} {{ pkey }}</button>
  `
})

Vue.component('photo-item', {
  props: ['url', 'pkey', 'action'],
  template: `
    <div class="grid-item">
      <a :href="url" target="_blank"> <img :src="url"></a>
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
      siteUrl: "http://leilaphotos.s3-website-eu-west-1.amazonaws.com/"
    },
    methods: {
      clear: function() {
        gridvue.albumNames = [];
        gridvue.photoUrls = [];
      },
      listAlbums: function () {
        this.clear();
        this.displayingPhotos=false;
        this.displayingAlbums=true;
        s3.listObjects({Delimiter: '/'}, function(err, data) {
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
      viewAlbum: function(albumName) {
        this.clear();
        this.displayingPhotos=true;
        this.displayingAlbums=false;
        gridvue.currentAlbum = albumName; 
        var albumPhotosKey = encodeURIComponent(albumName) + '/';
        s3.listObjects({Prefix: albumPhotosKey}, function(err, data) {
          if (err) {
            return alert('There was an error viewing your album: ' + err.message);
          }
          // `this` references the AWS.Response instance that represents the response
          var href = this.request.httpRequest.endpoint.href;
          var bucketUrl = href + albumBucketName + '/';
      
          var photos = data.Contents.map(function(photo) {
            var photoKey = photo.Key;
            var photoUrl =  bucketUrl + encodeURIComponent(photoKey);
            gridvue.photoUrls.push({"url":photoUrl, "key":photoKey});
            console.log(photoUrl, photoKey);

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
        s3.headObject({Key: albumKey}, function(err, data) {
          if (!err) {
            return alert('Album already exists.');
          }
          if (err.code !== 'NotFound') {
            return alert('There was an error creating your album: ' + err.message);
          }
          s3.putObject({Key: albumKey}, function(err, data) {
            if (err) {
              return alert('There was an error creating your album: ' + err.message);
            }
            alert('Successfully created album.');
            gridvue.viewAlbum(albumName);
          });
        });
      },

      deleteAlbum: function(albumName) {
        var albumKey = encodeURIComponent(albumName) + '/';
        s3.listObjects({Prefix: albumKey}, function(err, data) {
          if (err) {
            return alert('There was an error deleting your album: ', err.message);
          }
          var objects = data.Contents.map(function(object) {
            return {Key: object.Key};
          });
          s3.deleteObjects({
            Delete: {Objects: objects, Quiet: true}
          }, function(err, data) {
            if (err) {
              return alert('There was an error deleting your album: ', err.message);
            }
            alert('Successfully deleted album.');
            gridvue.listAlbums();
          });
        });
      },

      //this one uploads the photos to s3
      onFileChange(e) {  
        var files = e.target.files || e.dataTransfer.files;
        if (!files.length)
          return;
        console.log("files are", files);
        async.each(files, 
          function(file, callback){
            var fileName = file.name;
            var albumPhotosKey = encodeURIComponent(gridvue.currentAlbum) + '/';
            var photoKey = albumPhotosKey + fileName;
            console.log("photokey is ", photoKey);
            console.log("about to attempt ", fileName)
            s3.upload({
               Key: photoKey,
               Body: file,
               ContentType: 'image/jpeg',
               ACL: 'public-read'
            }, function(err, data) {
               if (err) {
                  callback(err.message);
               }
               console.log("No error.", data)
               callback();
            });
          },
          function(err) {
            console.log("Entered here and checking for errors");
            console.log("error!!", err)
            // if any of the file processing produced an error, err would equal that error
            if( err ) {
              // One of the iterations produced an error.
              // All processing will now stop.
              alert('A file failed to process', err);
              console.log("error!!", err)
              gridvue.viewAlbum(gridvue.currentAlbum);
            } else {
              alert('All files have been processed successfully');
              gridvue.viewAlbum(gridvue.currentAlbum);
            }
          }
        );
      },

      deletePhoto: function (photoKey) {
        s3.deleteObject({Key: photoKey}, function(err, data) {
          if (err) {
            return alert('There was an error deleting your photo: ', err.message);
          }
          alert('Successfully deleted photo.');
          gridvue.viewAlbum(gridvue.currentAlbum);
        });
      }
    


    }
})
