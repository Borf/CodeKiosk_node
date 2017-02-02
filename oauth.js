const https = require("https");
const crypto = require('crypto');

const config = require("./config.js");
const db = require("./database.js");

function generateLoginUserToken() {
  var token = '';
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for( var i=0; i < 16; i++ )
      token += possible.charAt(Math.floor(Math.random() * possible.length));

  return token;
}

function generateOauthNonce() {
  var token = '';
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for( var i=0; i < 32; i++ )
      token += possible.charAt(Math.floor(Math.random() * possible.length));

  return token.toString('base64');
}

function requestToken(req, res){
  var user_token = generateLoginUserToken();
  
  function tokenCallback(response) {
    const db = require("./database.js");
    
    var str = '';
    response.on('data', function (chunk) {
      str += chunk;
    });
    response.on('end', function () {
      var values = str.split("&");
      var data = {};
      values.forEach(function(val) {
        var sp = val.split("=");
        data[sp[0]] = sp[1];
      });
      if (data.oauth_callback_confirmed == "true") {
        req.CodeKioskAuth.loginToken = user_token;
        db.storeLoginUser(data.oauth_token_secret, user_token);
        res.render("pages/forward", {url: data.authentification_url + "?oauth_token=" + data.oauth_token});
        res.end();
      }
    });
  }
  
  var options = {
    host: config.AVANS_BASE_URL,
    port: 443,
    path: config.REQ_PATH
      + "?oauth_callback=" + encodeURIComponent(config.LOGIN_CALLBACK + user_token)
      + "&oauth_consumer_key=" + config.CONS_KEY
      + "&oauth_nonce=" + generateOauthNonce()
      + "&oauth_signature_method=" + "HMAC-SHA1"
      + "&oauth_timestamp=" + new Date().valueOf(),
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
  };
  var basePath = "GET&" + encodeURIComponent("https://" + config.AVANS_BASE_URL + config.REQ_PATH) + "&" + encodeURIComponent(options.path.substr(config.REQ_PATH.length + 1));
  var oauth_hash = encodeURIComponent(crypto.createHmac('sha1', config.CONS_SEC + "&").update(basePath).digest('base64'));
  
  options.path += "&oauth_signature=" + oauth_hash;

  https.get(options, tokenCallback).end();
}

function verifyToken(req, res, token, verifier, secret) {
  var data = {};
  var adat = {};
  
  function getUserInfoCallback(response) {
    const crypto = require('crypto');
    const cipher = crypto.createCipher('aes192', config.SESSION_PASS);
    
    var encrypted = '';
    cipher.on('readable', () => {
      var cipherData = cipher.read();
      if (cipherData)
        encrypted += cipherData.toString('hex');
    });
    cipher.on('end', () => {
      req.CodeKioskAuth.sessionToken = encrypted;
      delete req.CodeKioskAuth.loginToken;
      res.redirect("/");
    });
    
    var info = '';
    response.on('data', function (chunk) {
      info += chunk;
    });
    response.on('end', function () {
      if (info.split("\n")[1] == "Oauth failed") {
        console.log("info failed");
        res.redirect("/logout");
        // TODO: add error handling
      } else {
        var values = JSON.parse(info);
        adat.name = values.nickname;
        adat.student = values.student;
        cipher.write(JSON.stringify(adat));
        cipher.end();
      }
    });
  }
  
  function verifyCallbackTwo(response) {
    var str = '';
    response.on('data', function (chunk) {
      str += chunk;
    });
    response.on('end', function () {
      if (str.split("\n")[1] == "Oauth failed") {
        console.log("failed");
        // TODO: add error handling
      } else {
        var values = JSON.parse(str);
        adat.student_id = values[0].Id;
        adat.username = values[0].login;
        
        var optionsInfo = {
          host: config.AVANS_BASE_URL,
          port: 443,
          path: config.INFO_PATH
            + "?oauth_consumer_key=" + config.CONS_KEY
            + "&oauth_nonce=" + generateOauthNonce()
            + "&oauth_signature_method=" + "HMAC-SHA1"
            + "&oauth_timestamp=" + new Date().valueOf()
            + "&oauth_token=" + data.oauth_token,
          method: 'GET',
          headers: {
              'Content-Type': 'application/json'
          }
        };
        var basePath = "GET&" + encodeURIComponent("https://" + config.AVANS_BASE_URL + config.INFO_PATH) + "&" + encodeURIComponent(optionsInfo.path.substr(config.INFO_PATH.length + 1));
        var oauth_hash = encodeURIComponent(crypto.createHmac('sha1', config.CONS_SEC + "&" + data.oauth_token_secret).update(basePath).digest('base64'));
        optionsInfo.path += "&oauth_signature=" + oauth_hash;
        https.get(optionsInfo, getUserInfoCallback).end();
      }
    });
  }
  
  function verifyCallback(response) {
    var str = '';
    response.on('data', function (chunk) {
      str += chunk;
    });
    response.on('end', function () {
      if (str.split("\n")[1] == "Oauth failed") {
        console.log("failed");
        // TODO: add error handling
      } else {
        var values = str.split("&");
        values.forEach(function(val) {
          var sp = val.split("=");
          data[sp[0]] = sp[1];
        });
        
        var optionsTwo = {
          host: config.AVANS_BASE_URL,
          port: 443,
          path: config.API_PATH
            + "?oauth_consumer_key=" + config.CONS_KEY
            + "&oauth_nonce=" + generateOauthNonce()
            + "&oauth_signature_method=" + "HMAC-SHA1"
            + "&oauth_timestamp=" + new Date().valueOf()
            + "&oauth_token=" + data.oauth_token,
          method: 'GET',
          headers: {
              'Content-Type': 'application/json'
          }
        };
        var basePath = "GET&" + encodeURIComponent("https://" + config.AVANS_BASE_URL + config.API_PATH) + "&" + encodeURIComponent(optionsTwo.path.substr(config.API_PATH.length + 1));
        var oauth_hash = encodeURIComponent(crypto.createHmac('sha1', config.CONS_SEC + "&" + data.oauth_token_secret).update(basePath).digest('base64'));
        optionsTwo.path += "&oauth_signature=" + oauth_hash;

        https.get(optionsTwo, verifyCallbackTwo).end();
      }
    });
  }
  
  var options = {
    host: config.AVANS_BASE_URL,
    port: 443,
    path: config.ACC_PATH
      + "?oauth_consumer_key=" + config.CONS_KEY
      + "&oauth_nonce=" + generateOauthNonce()
      + "&oauth_signature_method=" + "HMAC-SHA1"
      + "&oauth_timestamp=" + new Date().valueOf()
      + "&oauth_token=" + token
      + "&oauth_verifier=" + verifier,
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
  };
  var basePath = "GET&" + encodeURIComponent("https://" + config.AVANS_BASE_URL + config.ACC_PATH) + "&" + encodeURIComponent(options.path.substr(config.ACC_PATH.length + 1));
  var oauth_hash = encodeURIComponent(crypto.createHmac('sha1', config.CONS_SEC + "&" + secret).update(basePath).digest('base64'));
  options.path += "&oauth_signature=" + oauth_hash;

  https.get(options, verifyCallback).end();
}

module.exports = {
  requestToken: requestToken,
  verifyToken: verifyToken
};