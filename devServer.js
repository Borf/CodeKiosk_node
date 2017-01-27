// Require official libraries
const path = require("path");
const fs = require("fs");
const express = require("express");
const sessions = require("client-sessions");
const bodyParser = require("body-parser");
const moment = require("moment");
const inspect = require('util').inspect;
const Busboy = require('busboy');

// Require own files
const config = require("./config.js");
const db = require("./database.js");
const oauth = require("./oauth.js");

// Declare server objects
var app = express();

// Declare required middleware
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));
// app.use(bodyParser.raw({limit: '10mb', type: 'multipart/form-data'}));

// Sets up session control
app.use(sessions({
  cookieName: 'CodeKioskAuth',
  secret: 'borf_requires_rear_entry',
  duration: 30 * 60 * 1000,
  activeDuration: 5 * 60 * 1000,
  cookie: {
    httpOnly: true,
    secure: false,
    ephemeral: true
  }
}));
app.use(function(req, res, next) {
  if (req.CodeKioskAuth.sessionToken) {
    const crypto = require('crypto');
    const decipher = crypto.createDecipher('aes192', config.SESSION_PASS);
    
    var decrypted = '';
    decipher.on('readable', () => {
      var data = decipher.read();
      if (data)
        decrypted += data.toString('utf8');
    });
    decipher.on('end', () => {
      req.user = JSON.parse(decrypted);
      next();
    });
    
    decipher.write(req.CodeKioskAuth.sessionToken, 'hex');
    decipher.end();
  } else {
    next();
  }
});

// Filter functions
function requireLogin (req, res, next) {
  if (!req.user) {
    oauth.requestToken(req, res);
  } else {
    next();
  }
}
function requireAdmin (req, res, next) {
  if (!req.user) {
    oauth.requestToken(res, req);
  } else {
    if (config.ADMIN_ARRAY.indexOf(req.user.name) === -1) {
      res.redirect("/");
    } else {
      next();
    }
  }
}

// API calls
app.post("/api/queue", requireAdmin, function(req, res) {
  function callback(err, r) {
    if (r.insertedId) {
      res.redirect("/");
    } else {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Failed insert');
    }
  }
  db.createQueue(req.body, res, callback);
});
/* TODO: enable update queue info
app.post("/api/queue/:id", requireAdmin, function(req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('updating queue with id: ' + req.params.id + '\n');
});
*/
app.delete("/api/queue/:id", requireAdmin, function(req, res) {
  res.writeHead(200, {'Content-Type': 'application/json'});
  function callback(err, r) {
    if (r.deletedCount > 0) {
      res.end(JSON.stringify({'message': 'Success!', 'id': req.params.id}));
    } else {
      res.end(JSON.stringify({'message': 'Failure!'}));
    }
  }
  db.deleteQueue(req.params.id, res, callback);
});
app.get("/api/queue/:id/next", function(req, res) {
  var callback = function(res, jar) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(jar));
  }
  db.getNextInQueue(req, res, req.params.id, callback);
});
app.get("/api/queues", function(req, res) {
  var callback = function(res, queues) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(queues));
  }
  db.getQueues(req, res, callback);
});

app.get("/api/jar/:id", function(req, res) {
  var id = req.params.id;
  function callback(err, jar) {
    res.sendFile(path.join(__dirname, config.JARS_PATH, jar.name + ".jar"));
  }
  db.getJar(res, id, callback);
});
app.post("/api/jar", requireLogin, function(req, res) {
  function generateFileName() {
    var name = '';
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < 16; i++ )
        name += possible.charAt(Math.floor(Math.random() * possible.length));

    return name;
  }
  function callback(err, r) {
    if (r.insertedId) {
      res.redirect("/");
    } else {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Failed insert');
    }
  }
  var jar_name = generateFileName();
  var busboy = new Busboy({ headers: req.headers });
  var form_data = {};
  busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
    file.pipe(fs.createWriteStream(path.join(__dirname, config.JARS_PATH, jar_name + ".jar")));
    form_data.jar_file = {name: jar_name, title: filename};
  });
  busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
    form_data[fieldname] = inspect(val).replace(/'/g, "");
  });
  busboy.on('finish', function() {
    if (!form_data.student_id || !form_data.queue_id || !form_data.jar_file) {
      if(form_data.jar_file) {
        fs.unlink(path.join(__dirpath, config.JARS_PATH, form_data.jar_file, '.jar'));
      }
      res.writeHead(400, {'Content-Type': 'text/plain'});
      res.end('Not enough data.');
    } else {
      db.addJar(form_data, res, callback);
    }
  });
  req.pipe(busboy);
});
app.get('/api/callback_login/:token', function(req, res) {
  var token = req.params.token;
  function callback(err, r) {
    oauth.verifyToken(req, res, req.query['oauth_token'], req.query['oauth_verifier'], r.oauth_token_secret)
  }
  db.getLoginUser(token, req, res, callback);
});
app.get('/api/set_test_cookie', function(req, res) {
  const crypto = require('crypto');
  const cipher = crypto.createCipher('aes192', config.SESSION_PASS);
  
  var encrypted = '';
  cipher.on('readable', () => {
    var data = cipher.read();
    if (data)
      encrypted += data.toString('hex');
  });
  cipher.on('end', () => {
    req.CodeKioskAuth.sessionToken = encrypted;
    res.redirect("/");
  });
  var data = {
    name: "Philip Rasmussen",
    student_id: 12321
  };
  cipher.write(JSON.stringify(data));
  cipher.end(); 
});
app.get('/logout', function(req, res) {
  req.CodeKioskAuth.reset();
  res.redirect('/');
});
/* app.get('/install/:authToken', function(req, res) {
  if (req.params.authToken === "ioWOi2294iohWWfo2") {
    db.installSess();
  }
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Database installed.\n');
}); */

// Website routes
app.get("/add_queue", requireAdmin, function(req, res) {
  res.render("pages/add_queue");
});
app.get("/add_jar/:id", requireAdmin, function(req, res) {
  res.render("pages/add_jar", {
    queue_id: req.params.id,
    student_id: req.user.student_id
  });
});
app.get("/", requireLogin, function(req, res) {
  var callback = function(res, queues) {
    res.render("pages/home", {
      moment: moment,
      isAdmin: (config.ADMIN_ARRAY.indexOf(req.user.name) >= 0 ? true : false),
      queues: queues
    });
  }
  db.getQueues(req, res, callback);
});

// Resources and 404 catch-all
app.all("*", requireLogin, function(req, res) {
  var accepted_resource_types = ['css', 'jpg', 'jpeg', 'gif', 'png', 'bmp'];
  if (accepted_resource_types.indexOf(req.params[0].split('.')[1]) === -1) {
    res.render("pages/404");
  } else {
    res.sendFile(path.join(__dirname, config.ASSETS_PATH, req.params[0].replace('..','')));
  }
});

// Start server
var server = app.listen(8081, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log("Listening at http://%s:%s\n", host, port);
});