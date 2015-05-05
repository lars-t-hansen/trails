#!/usr/bin/nodejs
const fs = require('fs');

const args = process.argv.slice(2);

if (args.length < 2) {
    console.log("Usage: adduser username password");
    process.exit(1);
}

var userdb;

try {
    userdb = JSON.parse(fs.readFileSync("data/users.json"));
}
catch (e) {
    console.log("Unable to read or parse user database");
    console.log("Error is:");
    console.log(e);
    process.exit(1);
}

if (!("version" in userdb) || userdb.version > 1) {
    console.log("User database has unsupported version: " + userdb.version);
    process.exit(1);
}

const username = args[0];
const password = args[1];

// TODO: vet the username: [A-Za-z0-9]+
// TODO: vet the password: not empty

for ( var i=0 ; i < userdb.users.length ; i++ ) {
    var u = userdb.users[i];
    if (u.user == username) {
	// TODO: This could be a password update, but only if there's
	// an explicit option to support that
	console.log("Duplicate user");
	process.exit(1);
    }
}

userdb.users.push({user: username, passwd: password});

// TODO: this races with any running server.

fs.writeFileSync("data/users.json", JSON.stringify(userdb));
