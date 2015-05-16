// Copyright 2015 Lars T Hansen.
// Code for Node.js.
//
// Usage:
//   node trails-server.js [--port portnumber]
//
// After setup this script calls runServer().

// TODO: everyone should just submit HTTP user/password as part of the
// request, not in the URL, since for the web client this is all wrong
// (shows up in the URL field).  The user may still be part of the
// URL, that would be OK.

// V8 does not allow the use of const in strict mode, for whatever reason.
// So don't use strict mode yet.

const http = require('http');
const fs = require('fs');

const g_defaultPort = 9003;

//////////////////////////////////////////////////////////////////////
//
// Configuration.

const g_scheme = "http";
const g_if = "0.0.0.0";
const g_rootdir = arg_rootdir();
const g_port = arg_portnumber();
const g_default = "trails.html";
const g_DEBUG = true;
const g_plotHeight = 1000;   // Customize
const g_plotWidth = 1000;    //   to the UA?

function arg_rootdir() {
    var p = process.argv[1];
    var x = p.lastIndexOf('/');
    if (x <= 0)			// Excludes root, I guess
	throw new Error("Bad program path: " + p);
    return p.substring(0, x+1);
}

function arg_portnumber() {
    var args = process.argv;
    for ( var i=2 ; i < args.length ; i++ ) {
	if (args[i] == "--")
	    break;
	if (args[i] == "--port") {
	    var p = 0;
	    if (i < args.length-1 && isFinite(p = parseInt(args[i+1])) && (p|0) === p && p > 0)
		return p;
	    throw new Error("Bad port: " + args.join(" "));
	}
    }
    return g_defaultPort;
}

//////////////////////////////////////////////////////////////////////
//
// Protocol layer.

function runServer() {
    if (!loadUsers())
	return;
    switch (g_scheme) {
    case "http":
	http.createServer(requestHandler).listen(g_port, g_if);
	break;
    default:
	console.log("Scheme " + g_scheme + " is not supported");
	process.exit(1);
    }
    console.log("Server running at " + g_scheme + "://" + g_if + ":" + g_port + "/");
}

// The protocol is documented in spec.txt.

const user_id = "[a-zA-Z0-9]+";
const uripart = "[-_.!~*'()a-zA-Z0-9]+";
const filename = "[-_a-zA-Z0-9.]+";
const post_trail_re = new RegExp("^\\/trail\\/(" + user_id + ")\\/(" + uripart + ")$");
const resource_re = new RegExp("^\\/r\\/(" + filename + ")$");
const default_re = new RegExp("^\\/?$");
const plot_re = new RegExp("^\\/plot\\/(" + user_id + ")\\/(" + uripart + ")\\/(" + uripart + ")$");

function requestHandler(req, res) {
    try {
	var m, user, passwd, host, params;

	if (g_DEBUG)
	    console.log(req.method + " " + req.url);

	switch (req.method) {
	case "GET":
	    // GET /r/filename
	    if ((m = req.url.match(resource_re)) && (fn = resourceFile(m[1]))) {
		// TODO: Make async
		serveFile(res, fn);
		return;
	    }
	    // GET /
	    if (req.url.match(default_re) && (host = req.headers.host)) {
		res.writeHead(301, {Location: g_scheme + "://" + host + "/r/" + g_default});
		res.end();
		return;
	    }
	    // GET /plot/user/pass/params
	    if ((m = req.url.match(plot_re)) && (user = m[1]) && (passwd = decodeURIComponent(m[2])) && (params = decodeURIComponent(m[3]))) {
		if (!checkUser(user, passwd)) {
		    simpleTextResponse(res, 403, "Bad user or password");
		    return;
		}
		// TODO: This requires "significant" server processing of data, which
		// scales poorly, and node.js has no obvious way to offload this.  Even
		// reading the data from disk may be slow and should be async.
		//
		// (JXCore may alleviate this by supporting multiple node workers.)
		servePlot(req, res, user, params);
		return;
	    }
	    break;
	case "POST":
	    // POST /trail/user/pass
	    if ((m = req.url.match(post_trail_re)) && (user = m[1]) && (passwd = decodeURIComponent(m[2]))) {
		if (!checkUser(user, passwd)) {
		    simpleTextResponse(res, 403, "Bad user or password");
		    return;
		}
		receiveTrail(req, res, user);
		return;
	    }
	    break;
	}
	simpleTextResponse(res, 404, "Bad request");
    }
    catch (e) {
	console.log("Server failure at outer level: " + e);
	serverFailure(e, req, res);
    }
}

function serverFailure(e, req, res) {
    try {
	console.log("Server failure:\n" + e);
	simpleTextResponse(res, 500, "Internal server error - blame the programmer");
    }
    catch (e) {
	try { req.connection.destroy(); } catch (e) { /* Oh well */ }
    }
}

function simpleTextResponse(res, code, message) {
    res.writeHead(code, {"Content-Type": "text/plain"});
    res.end(message);
}

function logError(error) {
    console.log(error);
}

/////////////////////////////////////////////////////////////////////
//
// Data input and validation.

function receiveTrail(req, res, user) {
    var bodyData = "";

    // TODO: error handling on receipt?
    req.on("data", function (data) {
	try {
	    bodyData += data;
	    // 10MB should be plenty, but we'll see.
	    if (bodyData.length > 1e7)
		req.connection.destroy();
	}
	catch (e) { /* Anything useful to do here? */ }
    });

    req.on("end", function () {
	try {
	    if (g_DEBUG) {
		console.log("Received data:")
		console.log("<<<");
		console.log(bodyData.substring(0,Math.min(500,bodyData.length)));
		console.log(">>>");
	    }

	    // TODO: Again the following processing may create a performance
	    // problem for the server (large data sets, usually, and then
	    // the synchronous write).

	    try {
		var parsed = JSON.parse(bodyData);
	    }
	    catch (e) {
		simpleTextResponse(res, 400, "Malformed data (not JSON)");
		return;
	    }
	    if (!validateTrail(parsed)) {
		simpleTextResponse(res, 400, "Malformed data (bad format)");
		return;
	    }
	    // TODO: Check against existing UUIDs
	    try {
		// FIXME: proper file name with uuid
		fs.writeFileSync(g_rootdir + "data/" + user + "/new-" + Date.now() + ".json", bodyData);
	    }
	    catch (e) {
		serverFailure(e, req, res);
		return;
	    }

	    res.writeHead(201, {"Content-Type": "application/json"});
	    if (parsed.version == 1)
		res.end(JSON.stringify({ id: parsed.id }));
	    else
		res.end(JSON.stringify({ uuid: parsed.uuid }));
	}
	catch (e) {
	    serverFailure(e, req, res);
	}
    });
}

function validateTrail(t) {
    if (!t || typeof t != "object")
	return false;

    if (!validatePositiveInt(t.version))
	return false;

    switch (t.version) {
    case 1:
	return (typeof t.id == "string" &&
		t.id.match(/^[A-Fa-f0-9]+$/) &&
		typeof t.device == "string" &&
		validateFinite(t.start) &&
		validateFinite(t.end) &&
		0 <= t.start && t.start <= t.end &&
		validateFinite(t.distance) &&
		t.distance >= 0 &&
		(!t.waypoints || validateWaypoints(t.waypoints)) &&
		validateReadings(t.readings));

    case 2:
	return (typeof t.uuid == "string" &&
		t.uuid.match(/^[A-F0-9]{16}$/) &&
		validateDevice(t.device) &&
		validateFinite(t.start) &&
		validateFinite(t.end) &&
		0 <= t.start && t.start <= t.end &&
		validateFinite(t.distance) &&
		t.distance >= 0 &&
		validateType(t.type) &&
		validateWaypoints(t.waypoints) &&
		validateReadings(t.readings));

    default:
	return false;
    }

    function validateType(ty) {
	if (typeof ty != "string")
	    return false;

	switch (ty) {
	case "bike":
	case "walk":
	case "hike":
	case "other":
	    return t.version >= 2;
	default:
	    return false;
	}
    }

    function validateDevice(x) {
	if (!x || typeof x != "object")
	    return false;

	return (typeof x.name == "string" &&
		typeof x.hardware == "string" &&
		typeof x.os == "string" &&
		typeof x.ua == "string");
    }

    function validateWaypoints(ws) {
	return validateDenseArray(ws, validateWaypoint);
    }

    function validateWaypoint(x) {
	if (!x || typeof x != "object")
	    return false;

	return (typeof x.name == "string" &&
		validateLatLon(x.lat) &&
		validateLatLon(x.lon));
    }

    function validateReadings(rs) {
	return validateDenseArray(rs, validateReading);
    }

    function validateReading(x) {
	if (!validateDenseArray(x) || x.length < 2)
	    return false;
	if (!(validateLatLon(x[0]) && validateLatLon(x[1])))
	    return false;
	if (t.version >= 2)
	    if (x.length < 3 || !validateFinite(x[2]) || x[2] < 0)
		return false;
	return true;
    }

    function validateDenseArray(xs, predicate) {
	if (!validatePositiveInt(xs.length))
	    return false;
	for ( var i=0 ; i < xs.length ; i++ ) {
	    if (!(i in xs))
		return false;
	    if (predicate !== undefined)
		if (!predicate(xs[i]))
		    return false;
	}
	return true;
    }

    function validateLatLon(x) {
	return validateFinite(x) && x >= -90.0 && x <= 90.0;
    }

    function validatePositiveInt(x) {
	if (!validateFinite(x))
	    return false;
	if (Math.floor(x) != x || x < 0)
	    return false;
	return true;
    }

    function validateFinite(x) {
	return typeof x == "number" && isFinite(x) && !isNaN(x);
    }
}

//////////////////////////////////////////////////////////////////////
//
// Plotting.

// Parameters would probably be the date-uuid strings of the files to
// serve up, perhaps with some keywords supported (all? latest? year?)
// and options on how to plot (initially none).  This would deliver an
// HTML document with SVG.

function servePlot(req, res, user, parameters) {
    try {
	var trails = [];

	// TODO: process parameters to get trail names, then load those trails
	// into the trails array.

	var dir = g_rootdir + "data/" + user;
	var files = fs.readdirSync(dir);

	if (parameters == "all") {
	    for ( var i=0 ; i < files.length ; i++ )
		trails.push(JSON.parse(fs.readFileSync(dir + "/" + files[i])));
	}

	var plot = plotTrails(g_plotHeight, g_plotWidth, trails);
	res.writeHead(200, {"Content-Type": "text/html"});
	res.end('<html>\n<body>\n' + plot + '</body>\n</html>');
    }
    catch (e) {
	serverFailure(e, req, res);
    }
}

// Given a number of trails, return SVG subcommands that draw all the
// trails within the same grid.
//
// TODO: it's anyone's guess if this works where latitude or longitude
// are negative, though I think it ought to.  Easy to test by
// systematically biasing latitude and/or longitude for a data set.
//
// FIXME: This will not work if the trail crosses the 180th parallel.
// FIXME: This may not work if the trail touches either pole.

// TODO: more colors.  There are 147 named colors to choose from, though not
// all are suitable.  http://www.december.com/html/spec/colorsvg.html

const g_colors = ["green","red","blue","yellow"];

function plotTrails(height, width, trails) {
    var lat_min = Number.POSITIVE_INFINITY;
    var lat_max = Number.NEGATIVE_INFINITY;
    var lon_min = Number.POSITIVE_INFINITY;
    var lon_max = Number.NEGATIVE_INFINITY;

    for ( var t=0 ; t < trails.length ; t++ ) {
	var rs = trails[t].readings;
	for ( var i=0 ; i < rs.length ; i++ ) {
            var r = rs[i];
            lat_min = Math.min(lat_min, r[0]);
            lat_max = Math.max(lat_max, r[0]);
            lon_min = Math.min(lon_min, r[1]);
            lon_max = Math.max(lon_max, r[1]);
	}
    }

    var lon_range = lon_max - lon_min;
    var lat_range = lat_max - lat_min;

    // Scale for non-square drawing surface first.

    var scale_lat = Math.min(1, width/height);
    var scale_lon = Math.min(1, height/width);

    // Scale for position on the earth second.
    //
    // The unit of measurement is a unit length along the y axis
    // (along the longitude), this value is everywhere the same.
    //
    // So the x measurements have to be scaled by the factor x_unit /
    // y_unit, where x_unit is a unit length along the x axis, at a
    // given latitude.

    var unit_y = distanceBetween(0, 0, 1, 0);
    var unit_x = distanceBetween(lat_min, Math.floor(lon_min), lat_min, Math.floor(lon_min)+1);

    scale_lon *= unit_x / unit_y;

    var polys = [];
    var nextcolor = 0;
    for ( var t=0 ; t < trails.length ; t++ ) {
	var rs = trails[t].readings;

	var poly = "";
	for ( var i=0 ; i < rs.length ; i++ ) {
            var r = rs[i];
            if (poly != "")
		poly += ", ";
            var lon = Math.round((r[1] - lon_min) / lon_range * width * scale_lon);
            var lat = height - Math.round((r[0] - lat_min) / lat_range * height * scale_lat);
            poly += lon + " " + lat;
	}
	polys.push('<polyline points="' + poly + '" fill="transparent" stroke="' + g_colors[nextcolor++] + '"/>');
    }

    return '<svg width="' + width + '" + height="' + height + '">' + polys.join('\n') + '\n</svg>';
}

const earth_avg_radius = 6371009.0;	// meters

function distanceBetween(lat_a, lon_a, lat_b, lon_b) {
    lat_a = (lat_a / 180) * Math.PI;
    lon_a = (lon_a / 180) * Math.PI;
    lat_b = (lat_b / 180) * Math.PI;
    lon_b = (lon_b / 180) * Math.PI;
    var delta_lon = Math.abs(lon_a - lon_b);
    var central_angle = Math.acos(Math.sin(lat_a) * Math.sin(lat_b) + Math.cos(lat_a) * Math.cos(lat_b) * Math.cos(delta_lon));
    return earth_avg_radius * central_angle;
}

//////////////////////////////////////////////////////////////////////
//
// File layer.

function resourceFile(base) {
    var fn = g_rootdir + "r/" + base;
    console.log("Trying <" + fn + "> " + fs.existsSync(fn));
    return fs.existsSync(fn) ? fn : null;
}

function serveFile(res, filename) {
    var data = fs.readFileSync(filename);
    res.writeHead(200, {"Content-Type": mimeTypeFromName(filename)});
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

const mimetypes =
    { ".html": "text/html",
      ".css":  "text/css",
      ".txt":  "text/plain",
      ".jpg":  "image/jpeg",
      ".png":  "image/png",
      ".js":   "application/javascript"
    };

const default_mimetype = "application/octet-stream";

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

var g_users = [];

// Format of users.dat:
//
//   { version: 1,
//     users:   [{ user: string, passwd: string }] }
//
// where in version 1 the passwords are in plaintext for now.

// FIXME: Why is this not data/users.json?  That's what adduser.js works on.

function loadUsers() {
    try {
	var tmp = JSON.parse(fs.readFileSync(g_rootdir + "users.dat"), {encoding:"utf8"});
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
