// Copyright 2015 Lars T Hansen.
// Code for Node.js.
//
// A USER-ID is some alphanumeric string.
// A PASSWD is some string, uriComponent-encoded.

// Protocol:
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

var http = require('http');
var fs = require('fs');

//////////////////////////////////////////////////////////////////////
// Configuration

var g_datadir = "/home/lth/src/trails-server/"; // FIXME
var g_port = 1338;

//////////////////////////////////////////////////////////////////////
// Globals

var g_users = [];

//////////////////////////////////////////////////////////////////////
// Protocol layer

function runServer() {
    if (!loadUsers())
	return;
    http.createServer(requestHandler).listen(port, '127.0.0.1');
    console.log('Server running at http://127.0.0.1:' + port + '/');
}

const user_id = "[a-zA-Z0-9]+";
const passwd = "[-_.!~*'()a-zA-Z0-9]+";
const post_trail_re = new RegExp("^\\/trail\\/(" + user_id + ")\\/(" + passwd + ")$");

function requestHandler(req, res) {
    var m, user, passwd
    switch (req.method) {
    case 'POST':
	if ((m = req.url.match(post_trail_re)) && (user = m[1]) && (passwd = decodeURIComponent(m2))) {
	    if (!checkUser(user, passwd)) {
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
// User database.
//
// Surely there must exist code for this already?

// Format of users.dat:
//
//   { version: 1,
//     users:   [{ user: string, passwd: string }] }
//
// where in version 1 the passwords are in plaintext for now.

function loadUsers() {
    try {
	var tmp = JSON.parse(fs.readFileSync(g_datadir + "/users.dat"), {encoding:'utf8'});
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
