var albumBucketName = 'leilaphotos';
var albumBucketNameThumb = 'leilaphotosthumb';
var bucketRegion = 'eu-west-1';
var IdentityPoolId = 'eu-west-1:2f189814-9f5a-4658-b248-560faa9747e8';

// var CognitoAuth = AmazonCognitoIdentity.CognitoAuth;
	
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
var dynamodb=null;

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
  methods: {
    onZoom: function() {
      gridvue.displayingSingle=true;
      gridvue.displayingPhotos=false;
      gridvue.displayingAlbums=false;
      console.log(this.pkey);
      gridvue.currentKey = this.pkey;
      console.log(this.url)
      gridvue.currentUrl = this.url;
      gridvue.modalUrl=this.url;
      gridvue.tags=[];
      var params = {
        ExpressionAttributeValues: {
         ":k": {
           S: this.pkey
          }
        }, 
        KeyConditionExpression: "image_id = :k", 
        ProjectionExpression: "keyword",
        IndexName: "image_id-index",
        TableName: "images"
       };
      dynamodb.query(params, function(err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else {  //add keywords to tags
          for (var i in data.Items) {
            gridvue.tags.push(data.Items[i].keyword.S);
          }
        }    
      })
      // $('#pic_modal').modal({"show":true})
    }
  },
  template: `
    <v-card @click="onZoom()">
      <v-img :src="thumburl"></v-img>
    </v-card>
  `
})

{/* <div class="grid-item">
<img :src="thumburl">
<confirm-button label="Delete" class="btn btn-danger" :action="action" :pkey="pkey"></confirm-button>
<button type="button" class="btn btn-primary" @click="onZoom()">View</button>
</div> */}

var gridvue = new Vue({
    el: '#gridvue',
    vuetify: new Vuetify(),
    data: {
      albumNames: [],
      photoUrls: [],
      currentAlbum: "",
      displayingAlbums: true,
      displayingPhotos: false,
      displayingSingle:false,
      pointer: 0,
      markers: [],
      endReached: false,
      signedIn: false,
      uploading: false,
      upCounter: 0,
      modalUrl: "",
      currentUrl: "",
      currentKey: "",
      searching: false,
      tags: [],
      drawer: false,
      del_dialog: false,
      getAlbumName: false,
      newAlbum:"",
      files: [],
      displayAlert: false,
      alertType: "info",
      alertMessage: "",
      uploadPhotos: false
    },
    mounted: function(){
      if (auth.isUserSignedIn(auth.getCurrentUser())){
        //console.log("User is signed in");
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

        dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

        // $('#pic_modal').on('hidden.bs.modal', function(){
        //   console.log("hiding modal");
        //   gridvue.modalUrl="";
        // });

        this.listAlbums()

      }
      else {
        //console.log("user is signed out");
        this.signedIn = false;
      }
    },

    methods: {
      listAlbums: async function () {
        this.albumNames = [];
        this.photoUrls = [];
        this.displayingPhotos=false;
        this.displayingSingle=false;
        this.displayingAlbums=true;

        try {
          const data = await s3.listObjects({Delimiter: '/', Bucket: albumBucketName}).promise();
          // console.log("data is ", data)
          var albums = data.CommonPrefixes.map(function(commonPrefix) {
            var prefix = commonPrefix.Prefix;
            var albumName = decodeURIComponent(prefix.replace('/', ''));
            gridvue.albumNames.push(albumName);
            //console.log(albumName);
          })
        } catch(e){
          gridvue.alertMessage = "There was an error listing your albums: " + e.message
          gridvue.alertType = "error"
          gridvue.displayAlert = true
          return 

        }
      },
      viewAlbum: function(albumName, direction) {
        this.displayingPhotos=true;
        this.displayingAlbums=false;
        this.displayingSingle=false;
        gridvue.searching=false;
        gridvue.uploadPhotos = false;
        this.albumNames = [];
        gridvue.currentAlbum = albumName; 
        //console.log('looking at ', gridvue.currentAlbum);
        //console.log("direction is ", direction);
        var albumPhotosKey = encodeURIComponent(albumName) + '/';
        if (direction == 'stt'){
          gridvue.pointer = -1;
          gridvue.markers = [];
          gridvue.photoUrls = []; //empty the array to start again
        };
        // I don't think I need this anymore.. never going back
        // if (direction =='bck'){
        //   gridvue.pointer -= 2;
        // }
        if (direction =='del'){
          //basically do nothing more....just trying to re-display the current set of photos
          return
        }
        var params = {
          Bucket: albumBucketNameThumb,
          Prefix: albumPhotosKey,
          Marker: gridvue.markers[gridvue.pointer],
          Delimiter: '~',
          MaxKeys: 24
        };
        s3.listObjects(params, function(err, data) {
          if (err) {
            gridvue.alertMessage = "There was an error viewing your album: " + err.message
            gridvue.alertType = "error"
            gridvue.displayAlert = true
            return
          }
          // `this` references the AWS.Response instance that represents the response
          //console.log("data is ", data);
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

          //console.log("pointer is ", gridvue.pointer);
          //console.log("markers are ", gridvue.markers)
      
          var photos = data.Contents.map(function(photo) {
            if (photo.Size >0) {  // try to avoid the weird folder "image"
              var photoKey = photo.Key;
              var photoUrl;
              var photoUrlThumb;
              //get signed urls for accessing the private images
              s3.getSignedUrl('getObject', {Bucket: albumBucketName, Key: photoKey, ResponseContentDisposition: `attachment; filename="${photoKey}"`}, function (err, url) {
                photoUrl = url;
                s3.getSignedUrl('getObject', {Bucket: albumBucketNameThumb, Key: photoKey}, function (err, url) {
                  photoUrlThumb = url;
                  gridvue.photoUrls.push({"url":photoUrl, "thumburl": photoUrlThumb, "key":photoKey});
                  //console.log("eh!",photoUrl, photoUrlThumb, photoKey);
                });
              });
            };
          });
        })
      },
      createAlbum: function(albumName) {
        albumName = albumName.trim();
        if (!albumName) {
          gridvue.alertMessage ="Album names must contain at least one non-space character"
          gridvue.alertType = "warning"
          gridvue.displayAlert = true
          return 
        }
        if (albumName.indexOf('/') !== -1) {
          gridvue.alertMessage ="Album names cannot contain slashes"
          gridvue.alertType = "warning"
          gridvue.displayAlert = true
          return 
        }
        var albumKey = encodeURIComponent(albumName) + '/';
        var params = {Key: albumKey,
                       Bucket: albumBucketName};
        //console.log("creating... ", params);
        s3.headObject(params, function(err, data) {
          if (!err) {
            gridvue.alertMessage ="Album already exists"
            gridvue.alertType = "warning"
            gridvue.displayAlert = true
            return 
          }
          if (err.code !== 'NotFound') {
            gridvue.alertMessage = "There was an error creating your album: " + err.message
            gridvue.alertType = "error"
            gridvue.displayAlert = true
            return 
          }
          s3.putObject(params, function(err, data) {
            if (err) {
              gridvue.alertMessage = "There was an error creating your album: " + err.message
              gridvue.alertType = "error"
              gridvue.displayAlert = true
              return 
            }
            gridvue.getAlbumName=false 
            gridvue.alertMessage ="Successfully created album"
            gridvue.alertType = "success"
            gridvue.displayAlert = true
            gridvue.newAlbum="" //empty string for next time
            gridvue.viewAlbum(albumName,"stt");
          });
        });
      },

      deleteAlbum: async function(albumName) {
        gridvue.del_dialog = false; // hide the delete confirmation dialog
        var objects;  //will contain the objects to delete
        var albumKey = encodeURIComponent(albumName) + '/';
        //first do it for the actual images
        //console.log("Listing objects")
        try {
          var data = await s3.listObjects({Prefix: albumKey, Bucket: albumBucketName}).promise()
          objects = data.Contents.map(function(object) {
            return {Key: object.Key};
            //console.log("objects is ", objects);

          });
        } catch (e) {
          gridvue.alertMessage = "There was an error finding your album for delete: " + e.message
          gridvue.alertType = "error"
          gridvue.displayAlert = true
          return;
        }

        //console.log("Now trying to delete objects")
        try {
          var data = await s3.deleteObjects({
            Bucket: albumBucketName,
            Delete: {Objects: objects,  Quiet: true}
          }).promise()

        } catch(e) {
          gridvue.alertMessage = "There was an error deleting your album: " + e.message
          gridvue.alertType = "error"
          gridvue.displayAlert = true
          return 
        }

        //then do it for the thumbnails
        //console.log("Listing thumbnail  objects")
        objects = {} //empty the object

        try{
          var data = await s3.listObjects({Prefix: albumKey, Bucket: albumBucketNameThumb}).promise()
          objects = data.Contents.map(function(object) {
            return {Key: object.Key};
          });
          //console.log("objects is ", objects);
        } catch(e) {
          gridvue.alertMessage = "There was an error finding your album for delete: " + e.message
          gridvue.alertType = "error"
          gridvue.displayAlert = true
        }

        try {
          if (objects.length>0) {
            //console.log("Now trying to delete thumbnail objects (but only if there are any)")
            var data = await s3.deleteObjects({
              Bucket: albumBucketNameThumb,
              Delete: {Objects: objects,  Quiet: true}
            }).promise()
          }
        } catch (e) {
          gridvue.alertMessage = "There was an error deleting your album: " + e.message
          gridvue.alertType = "error"
          gridvue.displayAlert = true
          return 
        }
        // if I get here then all is well
        gridvue.alertMessage = "Successfully deleted album"
        gridvue.alertType = "success"
        gridvue.displayAlert = true
        gridvue.listAlbums();
   
      },

      //this one uploads the photos to s3
      onFileChange(files) {
        if (!files.length)
          return;
        // console.log("files are", files);
        gridvue.uploading = true;
        gridvue.upCounter = files.length;
        async.eachLimit(files,4, 
          function(file, callback){
            var fileName = file.name;
            var albumPhotosKey = encodeURIComponent(gridvue.currentAlbum) + '/';
            var photoKey = albumPhotosKey + fileName;
            //console.log("photokey is ", photoKey);
            //console.log("about to attempt ", fileName);
            //console.log("file type is ", file.type);
            s3.upload({
              Bucket: albumBucketName,
               Key: photoKey,
               Body: file,
               ContentType: file.type,
               ACL: 'private',
               StorageClass: 'STANDARD'
            }, function(err, data) {
               if (err) {
                  gridvue.uploading = false;
                  return callback(err.message);
               }
               //console.log("No error.", data)
               console.log(gridvue.upCounter--)
               callback();
            });
          },
          function(err) {
            //console.log("Entered here and checking for errors");
            // if any of the file processing produced an error, err would equal that error
            if( err ) {
              // One of the iterations produced an error.
              // All processing will now stop.
              gridvue.alertMessage = "A file failed to process: " + err
              gridvue.alertType = "error"
              gridvue.displayAlert = true
              console.log("error!!", err)
              gridvue.viewAlbum(gridvue.currentAlbum,"stt");
            } else {
              gridvue.uploading = false;
              gridvue.files=[];
              gridvue.alertMessage = "All files have been processed successfully"
              gridvue.alertType = "success"
              gridvue.displayAlert = true
              gridvue.viewAlbum(gridvue.currentAlbum, "stt");
            }
          }
        );
      },

      deletePhoto: function (photoKey) {
        gridvue.del_dialog = false; // hide the delete confirmation dialog
        s3.deleteObject({Key: photoKey, Bucket:albumBucketName}, function(err, data) {
          if (err) {
            gridvue.alertMessage = "There was an error deleting your photo: " + err.message
            gridvue.alertType = "error"
            gridvue.displayAlert = true
            return
          }
          s3.deleteObject({Key: photoKey, Bucket:albumBucketNameThumb}, function(err, data) {
            if (err) {
              gridvue.alertMessage = "There was an error deleting your photo thumbnail: " + err.message
              gridvue.alertType = "error"
              gridvue.displayAlert = true
              return
            }
            //now remove the thumbnail from the display so it stops showing
            //first find the object that contains it
            const del_obj = gridvue.photoUrls.find(o=> o.key==photoKey)
            //then find the index of that object in the array
            const del_index = gridvue.photoUrls.indexOf(del_obj)
            //console.log("index is ", del_index)
            //console.log("array length is ", gridvue.photoUrls.length)
            if (del_index >-1) {
              gridvue.photoUrls.splice(del_index,1)
              //console.log("Now array length is ", gridvue.photoUrls.length)
            }
            gridvue.alertMessage = "Successfully deleted photo"
            gridvue.alertType = "success"
            gridvue.displayAlert = true
            gridvue.viewAlbum(gridvue.currentAlbum,"del");
          });
        });
      },

      search: function(keyword){
        // $('#pic_modal').modal('hide')
        gridvue.searching=true;
        gridvue.displayingPhotos=true;
        gridvue.displayingAlbums=false;
        gridvue.displayingSingle=false;
        var params = {
          ExpressionAttributeValues: {
           ":k": {
             S: keyword
            }
          }, 
          KeyConditionExpression: "keyword = :k", 
          ProjectionExpression: "image_id, confidence",
          IndexName: "keyword-index",
          TableName: "images",
          Limit: 20
         };
        dynamodb.query(params, function(err, data) {
          //console.log(data);
          if (err) console.log(err, err.stack); // an error occurred
          else {  //add images to the gridvue array
            //sort items in reverse confidence order using this sort function
            data.Items = data.Items.sort(function(item1, item2){
              var v1= parseFloat(item1.confidence.N);
              var v2= parseFloat(item2.confidence.N);
              if (v1 < v2) return 1;
              if (v1 > v2) return -1;
              return 0;
            })
            gridvue.photoUrls=[];  //empty the photos array
            data.Items.map(function(item){
              var key = item.image_id.S;
              //console.log("key is ", key, " and confidence is ", item.confidence.N);
              var photoUrl="";
              var photoUrlThumb="";
              s3.getSignedUrl('getObject', {Bucket: albumBucketName, Key: key,ResponseContentDisposition: `attachment; filename="${key}"`}, function (err, url) {
                photoUrl = url;
                //console.log("this is the url with CD", url)
                s3.getSignedUrl('getObject', {Bucket: albumBucketNameThumb, Key: key}, function (err, url) {
                  photoUrlThumb = url;
                  gridvue.photoUrls.push({"url":photoUrl, "thumburl": photoUrlThumb, "key":key});
                });
              });
            })
          }    
        })

      },

      downloadPhoto: function (imageURL) {
        window.open(imageURL)
      }
    


    }
})

