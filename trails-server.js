// Copyright 2015 Lars T Hansen.
// Code for Node.js.
//
// A USER-ID is some alphanumeric string.
// A PASSWD is some string, uriComponent-encoded.

// Protocol:
//
// GET /r/FILENAME
//   Respond 200 OK with the named file if it exists.
//   Note, this is for static resources.
//
// POST /trail/USER-ID/PASSWD
//   Payload: the contents of the trail, a JSON object as outlined in
//     spec.txt, notably with a UUID field.
//   Respond 404 Not found if the user does not exist.
//   Respond 404 Not found if the password is wrong.
//   Respond 409 Conflict if a record with the UUID of the datum already
//     exists in the database.
//   Otherwise create a new trail for the user and respond 201 Created
//     with a JSON-encoded object { UUID: <uuid> } <uuid> is the input
//     uuid.
//
// Files are stored in data/USER-ID:
//   summary.json contains summary data
//   <date>-<uuid>.json where date is yyyymmddhhmmss and uuid is a 16-hex-digit
//     UUID value (found in the file) is a trail.
//
// summary.json version 1:
//
//   { version: 1,
//     waypoints: [ { name: string, lat: number, lon: number }, ... ],
//     data: [ { start: number,
//               file: string,
//               type: string,
//               label: string,
//               comment: string,
//               distance: number,
//               time: number,
//               waypoints: [string, ...] }, ... ] }
//
//   where distance is in meters and time in seconds.  The label and
//   comment any user-assigned values (default nothing), and the type
//   is standardized, see below.  Waypoints (within a trip) is the set
//   of waypoints that were found to be touched by the trip when the
//   trip data were last processed.  Waypoints (overall) is the
//   complete set of waypoints for this user.
//
// <date>-<uuid>.json version 1:
//
//   { version: 1,
//     id: string,
//     device: string,
//     start: number,
//     end: number,
//     distance: number,
//     readings: [[lat,lon], ...] }
//
// <date>-<uuid>.json version 2 (Note incompatible change from "id" to "uuid" and
//   change in meaning of "device")
//
//   { version: 2,
//     uuid: string,
//     device: { name: string, hardware: string, os: string, ua: string },
//     start: number,
//     end: number,
//     distance: number,
//     waypoints: [ { name: string, lat: number, lon: number }, ... ],
//     type: string,
//     readings: [[lat,lon,delta], ...] }
//
//   Valid values for "type" are "bike", "ski", "walk", "other".
//   Delta is the delta between the time of the observation and the start time.
//   Values of device are best effort, empty string if no data available.  The
//     purpose is to allow values originating on specific devices or software
//     to be tracked over time, in case future adjustments need to be made
//     or if specific devices are found to be faulty in some way.

var http = require('http');
var fs = require('fs');

//////////////////////////////////////////////////////////////////////
// Configuration

var g_datadir = "/home/lth/trails/"; // CONFIGUREME
var g_port = 9003;
var g_default = "trails.html";

//////////////////////////////////////////////////////////////////////
// Globals

var g_users = [];

//////////////////////////////////////////////////////////////////////
// Protocol layer

function runServer() {
    if (!loadUsers())
	return;
    http.createServer(requestHandler).listen(g_port, '0.0.0.0');
    console.log('Server running at http://0.0.0.0:' + g_port + '/');
}

const user_id = "[a-zA-Z0-9]+";
const passwd = "[-_.!~*'()a-zA-Z0-9]+";
const post_trail_re = new RegExp("^\\/trail\\/(" + user_id + ")\\/(" + passwd + ")$");
const filename = "[-_a-zA-Z0-9.]+";
const resource_re = new RegExp("^\\/r\\/(" + filename + ")$");
const default_re = new RegExp("^\\/?$");

function requestHandler(req, res) {
    var m, user, passwd
    console.log(req.method + " " + req.url);
    switch (req.method) {
    case 'GET':
	// Must serve up the app files, at least.
	if ((m = req.url.match(resource_re)) && (fn = resourceFile(m[1]))) {
	    serveFile(res, fn);
	    return;
	}
	// This is wrong: it needs to serve up a redirect, or relative links from within
	// a document won't work.
	/*
	if ((m = req.url.match(default_re)) && (fn = resourceFile(g_default))) {
	    serveFile(res, fn);
	    return;
	}
	*/
	break;
    case 'POST':
	if ((m = req.url.match(post_trail_re)) && (user = m[1]) && (passwd = decodeURIComponent(m[2]))) {
	    if (!checkUser(user, passwd)) {
		console.log("Bad user or password");
		errNoDocument(req, res);
		return;
	    }
	    var bodyData = "";
	    // TODO: error handling on receipt?
	    req.on("data", function (data) {
		bodyData += data;
		// 1MB should be plenty, but we'll see.
		if (bodyData.length > 1e6)
                    req.connection.destroy();
            });
            req.on("end", function () {
		console.log("Received data")
		console.log("<<<");
		console.log(bodyData);
		console.log(">>>");
		// TODO: exceptions here?
		var parsed = JSON.parse(bodyData);
		// TODO: validate it
		// TODO: check against existing UUIDs
		res.writeHead(201, {'Content-Type': 'application/json'});
		res.end(JSON.stringify({ uuid: parsed.uuid }));
            });
	    return;
	}
	break;
    }
    errNoDocument(req, res);
}

function errNoDocument(req, res, extra) {
    logError("Bad request: " + req.url);
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end('No such document' + (typeof extra == 'string' ? (' ' + extra) : ''));
}

function logError(error) {
    console.log(error);
}

//////////////////////////////////////////////////////////////////////
//
// File layer.

function resourceFile(base) {
    var fn = g_datadir + "r/" + base;
    console.log("Trying <" + fn + "> " + fs.existsSync(fn));
    return fs.existsSync(fn) ? fn : null;
}

function serveFile(res, filename) {
    var data = fs.readFileSync(filename);
    res.writeHead(200, {'Content-Type': mimeTypeFromName(filename)});
    res.end(data);
}

//////////////////////////////////////////////////////////////////////
//
// Utilities.

if (!String.prototype.endsWith)
    String.prototype.endsWith = function (s) {
	if (s.length > this.length)
	    return false;
	return this.substring(this.length-s.length) == s;
    };

var mimetypes =
    { ".html": "text/html",
      ".css":  "text/css",
      ".txt":  "text/plain",
      ".jpg":  "image/jpeg",
      ".png":  "image/png",
      ".js":   "application/javascript"
    };
var default_mimetype = "application/octet-stream";

function mimeTypeFromName(name) {
    for ( var pattern in mimetypes )
	if (name.endsWith(pattern))
	    return mimetypes[pattern];
    return default_mimetype;
}

//////////////////////////////////////////////////////////////////////
//
// User database.
//
// TODO: Surely there must exist code for this already?

// Format of users.dat:
//
//   { version: 1,
//     users:   [{ user: string, passwd: string }] }
//
// where in version 1 the passwords are in plaintext for now.

function loadUsers() {
    try {
	var tmp = JSON.parse(fs.readFileSync(g_datadir + "users.dat"), {encoding:'utf8'});
	if (!tmp || typeof tmp != "object")
	    throw new Error("users.dat: Not an object");
	if (!tmp.hasOwnProperty("version") || tmp.version != 1)
	    throw new Error("users.dat: Bad version");
	if (!tmp.hasOwnProperty("users"))
	    throw new Error("users.dat: Bad format");
	var users = tmp.users;
	if (!(users instanceof Array))
	    throw new Error("users.dat: Users is not an array");
	for ( var i=0 ; i < users.length ; i++ ) {
	    var x = users[i];
	    if (x && typeof x == "object" &&
		x.hasOwnProperty("user") && typeof x.user == "string" &&
		x.hasOwnProperty("passwd") && typeof x.passwd == "string")
	    {
		continue;
	    }
	    throw new Error("users.dat: Not a valid user record @ " + i);
	}
	g_users = tmp.users;
	return true;
    }
    catch (e) {
	logError(e);
	return false;
    }
}

// Return true or false.

function checkUser(user, passwd) {
    for ( var i=0 ; i < g_users.length ; i++ ) {
	var x = g_users[i];
	if (x.user === user) {
	    // TODO: We want the passwords in the DB to be salted and hashed, and
	    // to salt and hash the provided passwd here before comparison.
	    if (x.passwd === passwd)
		return true;
	}
    }
    return false;
}

runServer();
