// database driver
var path = require('path');
var config = require('./config.js');
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var assert = require('assert');

/* Create Queue call
 * data format:
 * {
 *  name: "Tester",                 // String. Name of the queue.
 *  start_date: 12312890481293,     // Unix timestamp. Designates when the queue will be open for upload.
 *  end_date: 12312890481293,       // Unix timestamp. Designates when the queue will be closed from upload.
 *  play_time: 60,                  // Seconds. How long the applications in the queue should run.
 *  playback_mode: 0,               // Integer from 0 to 4.  0: first to last, repeat. 1: first to last, randomize after. 2: last to first, repeat. 3: last to first, randomize. 4: randomize.
 * }
 */
function createQueue(data, res, callback) {
  MongoClient.connect(config.DATABASE_URL, function(err, db) {
    assert.equal(null, err);
    
    var date_parts = data.start_date.split('-');
    data.start_date = new Date(date_parts[1] + "/" + date_parts[0] + "/" + date_parts[2]).toString();
    date_parts = data.end_date.split('-');
    data.end_date = new Date(date_parts[1] + "/" + date_parts[0] + "/" + date_parts[2]).toString();
    
    var collection = db.collection('queues');
    
    collection.insertOne(data, function(err, r) {
      createQueuePointer(r.insertedId);
      callback(err, r);
    });

    db.close();
  });
}

function getQueues(req, res, callback) {
  MongoClient.connect(config.DATABASE_URL, function(err, db) {
    assert.equal(null, err);
    
    var collection = db.collection('queues');
    
    collection.find({}).toArray(function(err, docs) {
      assert.equal(err, null);
      return_data = docs;
      callback(res, return_data);
    });

    db.close();
  });
}

function getJar(res, id, callback) {
  MongoClient.connect(config.DATABASE_URL, function(err, db) {
    assert.equal(null, err);
    var collection = db.collection('jars');
    collection.findOne({name: id}, callback);
    db.close();
  });
}

function deleteQueue(queue_id, res, callback) {
  MongoClient.connect(config.DATABASE_URL, function(err, db) {
    assert.equal(null, err);
    db.collection('jars').deleteMany({queue_id: queue_id});
    db.collection('pointers').deleteOne({queue_id: ObjectId(queue_id)});
    db.collection('queues').deleteOne({_id: ObjectId(queue_id)}, callback);
    db.close();
  });
}

function getNextInQueue(req, res, queue_id, callback) {
  MongoClient.connect(config.DATABASE_URL, function(err, db) {
    assert.equal(null, err);
    function callbackOne(err, pointer) {
      var jar_data = {};
      var cursor = db.collection('jars').find({queue_id});
      cursor.sort({timestamp: 1});
      cursor.skip(pointer.current);
      cursor.limit(1);
      cursor.each(function(err, jar) {
        if (err) throw err;
        if (jar != null) {
          jar_data.url = "http://codekiosk.borf.nl/api/jar/" + jar.name;
          jar_data.title = jar.title;
          jar_data.student_id = jar.student_id;
        } else {
          updateQueuePointer(queue_id, true);
          callback(res, jar_data);
        }
      });
    }
    db.collection('pointers').findOne({queue_id: ObjectId(queue_id)}, callbackOne);
    // db.close();
  });
}

function addJar(form_data, res, callback) {
  MongoClient.connect(config.DATABASE_URL, function(err, db) {
    assert.equal(null, err);
    
    var collection = db.collection('jars');
    
    if(collection.find({student_id: form_data.student_id}).toArray().length > 0) {
      console.log("Student already uploaded a jar.");
      // TODO: add error handling or overwrite
    } else {      
      var data = {
        queue_id: form_data.queue_id,
        student_id: form_data.student_id,
        name: form_data.jar_file.name,
        title: form_data.jar_file.title,
        timestamp: new Date().valueOf()
      };
      
      collection.insertOne(data, function(err, r) {
        updateQueuePointer(form_data.queue_id);
        callback(err, r);
      });
    }

    db.close();
  });
}

function storeLoginUser(secret, user_token) {
  MongoClient.connect(config.DATABASE_URL, function(err, db) {
    assert.equal(null, err);
    var collection = db.collection('loginSecrets');
    collection.insert({oauth_token_secret: secret, user_token: user_token})
      .then(function(res) {
        db.close();
      });
  });
}

function getLoginUser(user_token, req, res, callback) {
  MongoClient.connect(config.DATABASE_URL, function(err, db) {
    var collection = db.collection('loginSecrets');
    collection.findOne({user_token: user_token}, callback);
    db.close();
  });
}

function createQueuePointer(queue_id) {
  MongoClient.connect(config.DATABASE_URL, function(err, db) {
    function callbackThree(err, r) {
      return true;
    }
    function callbackTwo(err, res) {
      assert.equal(null, err);
      var pointerCollection = db.collection('pointers');
      var data = {
        queue_id: queue_id,
        current: 0,
        length: res,
        completed: false,
      };
      
      pointerCollection.insertOne(data, callbackThree);
    }
    function callbackOne(err, result) {
      assert.equal(null, err);
      var jarCollection = db.collection('jars');
      jarCollection.count({queue_id: queue_id}, callbackTwo);
    }
    var queueCollection = db.collection('queues');
    queueCollection.findOne({_id: ObjectId(queue_id)}, callbackOne);
  });
}

function updateQueuePointer(queue_id, advance = false) {
  var initData = {};
  var playback_mode = 0;
  MongoClient.connect(config.DATABASE_URL, function(err, db) {
    function callbackFour(err, r) {
      db.close();
      return true;
    }
    function callbackThree(err, res) {
      assert.equal(null, err);
      var preVal = initData;
      if (advance) {
        switch (playback_mode) {
          case "0":
            initData.current = preVal.current + 1;
            if (initData.current == res) {
              initData.current = 0;
              initData.completed = true;
            }
            break;
          case "1":
            initData.current = preVal.current - 1;
            if (initData.current == -1) {
              initData.current = (res - 1);
              initData.completed = true;
            }
            break;
          case "2":
            initData.current = Math.floor(Math.random() * res);
            break;
        }
      } else {
        if (preVal.length < res) {
          if (preVal.completed) {
            initData.current = (res - 1);
          } 
        } else if (preVal.length > res) {
          if (preVal.current >= res) {
            initData.current = (res - 1);
          }
        }
      }
      initData.length = res;
      
      var pointerCollection = db.collection('pointers');
      pointerCollection.update({queue_id: ObjectId(queue_id)}, initData, callbackFour);
    }
    function callbackTwo(err, queue) {
      playback_mode = queue.playback_mode;
      var jarCollection = db.collection('jars');
      jarCollection.count({queue_id: queue_id}, callbackThree);
    }
    function callbackOne(err, result) {
      assert.equal(null, err);
      initData = result;
      db.collection('queues').findOne({_id: ObjectId(queue_id)}, callbackTwo);
    }
    var pointerCollection = db.collection('pointers');
    pointerCollection.findOne({queue_id: ObjectId(queue_id)}, callbackOne);
  });
}

/* function installDB() {
  MongoClient.connect(config.DATABASE_URL, function(err, db) {
    db.createCollection('loginSecrets', {capped: true, size: 500000});
    db.createCollection('jars');
    db.createCollection('queues');
    db.createCollection('pointers');
  });
} */

module.exports = {
  // installDB: installDB,
  createQueue: createQueue,
  getQueues: getQueues,
  getNextInQueue: getNextInQueue,
  getJar: getJar,
  deleteQueue: deleteQueue,
  addJar: addJar,
  storeLoginUser: storeLoginUser,
  getLoginUser: getLoginUser
  
}