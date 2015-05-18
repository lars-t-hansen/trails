#!/usr/bin/nodejs

// Add a user to the user database.  Run in the directory above the
// data directory.
//
// usage: adduser.js username password
//
// TODO: not terribly safe to specify the password on the command line,
// it's better to read it from the console.
//
// TODO: Must add data/users/waypoints.json

const fs = require('fs');
const args = process.argv.slice(2);

if (args.length != 2)
    fail("Usage: adduser username password");

var userdb;

try {
    userdb = JSON.parse(fs.readFileSync("data/users.json"));
}
catch (e) {
    fail("Unable to read or parse user database\n" +
	 "Error is:\n" +
	 e);
}

if (!("version" in userdb) || userdb.version > 1)
    fail("User database has unsupported version: " + userdb.version);

const username = args[0];
const password = args[1];

if (!username.match(/^[A-Za-z0-9]+$/))
    fail("Bad user name, must match [A-Za-z0-9]+");

if (password == "")
    fail("Empty password");

for ( var i=0 ; i < userdb.users.length ; i++ ) {
    var u = userdb.users[i];
    // TODO: A duplicate user could be a password update, but only if there's
    // an explicit option to support that, and we don't have that
    if (u.user == username)
	fail("Duplicate user " + username);
}

userdb.users.push({user: username, passwd: password});

// TODO: this races with any server that's just starting up.
// TODO: this races with other runs of adduser.js
// TODO: if there's a running server then it needs to re-read the users
//       after we add one.

fs.writeFileSync("data/users.json", JSON.stringify(userdb));

function fail(msg) {
    console.log(msg);
    process.exit(1);
}
