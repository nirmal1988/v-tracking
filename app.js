/*eslint-env node */
"use strict";
/* global process */
/* global __dirname */
/*******************************************************************************
 * Copyright (c) 2015 IBM Corp.
 *
 * All rights reserved. 
 *
 * Contributors:
 *   David Huffman - Initial implementation
 *******************************************************************************/
/////////////////////////////////////////
///////////// Setup Node.js /////////////
/////////////////////////////////////////
var express = require("express");


var session = require("express-session");
var compression = require("compression");
var serve_static = require("serve-static");
var path = require("path");
var morgan = require("morgan");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");
var http = require("http");
var app = express();
var url = require("url");
var async = require("async");
var setup = require("./setup");
var cors = require("cors");
var fs = require("fs");
var parseCookie =cookieParser("Somethignsomething1234!test");
var sessionStore = new session.MemoryStore();


//// Set Server Parameters ////
// get the app environment from Cloud Foundry
//var cfenv = require('cfenv');
//var appEnv = cfenv.getAppEnv();

var host = setup.SERVER.HOST;
var port = setup.SERVER.PORT;

console.log("app running on "+ host + "----"+ port);

////////  Pathing and Module Setup  ////////
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");
app.engine(".html", require("jade").__express);
app.use(compression());
app.use(morgan("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded()); 
app.use(parseCookie);
app.use("/cc/summary", serve_static(path.join(__dirname, "cc_summaries")) );												//for chaincode_parts investigator
app.use( serve_static(path.join(__dirname, "public"), {maxAge: "1d", setHeaders: setCustomCC}) );							//1 day cache
//app.use( serve_static(path.join(__dirname, 'public')) );
app.use(session({secret:"Somethignsomething1234!test", resave:true, saveUninitialized:true, store: sessionStore}));

function setCustomCC(res, path) {
	if (serve_static.mime.lookup(path) === "image/jpeg")  res.setHeader("Cache-Control", "public, max-age=2592000");		//30 days cache
	else if (serve_static.mime.lookup(path) === "image/png") res.setHeader("Cache-Control", "public, max-age=2592000");
	else if (serve_static.mime.lookup(path) === "image/x-icon") res.setHeader("Cache-Control", "public, max-age=2592000");
}
// Enable CORS preflight across the board.
app.options("*", cors());
app.use(cors());

//// Router ////
var router = require("./routes/site_router");
app.use("/", router);

///////////  Configure Webserver  ///////////
app.use(function(req, res, next){
	var keys;
	console.log("------------------------------------------ incoming request ------------------------------------------");
	console.log("New " + req.method + " request for", req.url);
	req.bag = {};											//create my object for my stuff
	req.session.count = eval(req.session.count) + 1;
	req.bag.session = req.session;
	
	var url_parts = url.parse(req.url, true);
	req.parameters = url_parts.query;
	keys = Object.keys(req.parameters);
	if(req.parameters && keys.length > 0) console.log({parameters: req.parameters});		//print request parameters
	keys = Object.keys(req.body);
	if (req.body && keys.length > 0) console.log({body: req.body});						//print request body
	next();
});

////////////////////////////////////////////
////////////// Error Handling //////////////
////////////////////////////////////////////
app.use(function(req, res, next) {
	var err = new Error("Not Found");
	err.status = 404;
	next(err);
});
app.use(function(err, req, res, next) {		// = development error handler, print stack trace
	console.log("Error Handeler -", req.url);
	var errorCode = err.status || 500;
	res.status(errorCode);
	req.bag.error = {msg:err.stack, status:errorCode};
	if(req.bag.error.status == 404) req.bag.error.msg = "Sorry, I cannot locate that file";
	res.render("template/error", {bag:req.bag});
});

// ============================================================================================================================
// 														Launch Webserver
// ============================================================================================================================
var server = http.createServer(app);//.listen(port, host, function() {console.log("creer serveur(((((((((((((((((((((((((((((((-");});
server.listen(port, function listening() {
	console.log("Listening on %d", server.address().port);
});
//var server = http.createServer(app).listen(port, '192.168.1.2');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
process.env.NODE_ENV = "production";
server.timeout = 240000;																							// Ta-da.
console.log("------------------------------------------ Server Up - " + host + ":" + port + " ------------------------------------------");
if(process.env.PRODUCTION) console.log("Running using Production settings");
else console.log("Running using Developer settings");


// ============================================================================================================================
// ============================================================================================================================
// ============================================================================================================================
// ============================================================================================================================
// ============================================================================================================================
// ============================================================================================================================

// ============================================================================================================================
// 														Warning
// ============================================================================================================================

// ============================================================================================================================
// 														Entering
// ============================================================================================================================

// ============================================================================================================================
// 														Test Area
// ============================================================================================================================
var wsInteraction = require("./utils/wsInteraction");
var ws = require("ws");

var Ibc1 = require("ibm-blockchain-js");
var ibc = new Ibc1();

// ==================================
// load peers manually or from VCAP, VCAP will overwrite hardcoded list!
// ==================================
var manual = JSON.parse(fs.readFileSync(__dirname + "/data.json", "utf8"));


var peers = manual.credentials.peers;
console.log("loading hardcoded peers");
var users = manual.credentials.user;																		//users are only found if security is on
if(manual.credentials.users) users = manual.credentials.users;
console.log("loading hardcoded users");

if(process.env.VCAP_SERVICES){															//load from vcap, search for service, 1 of the 3 should be found...
	var servicesObject = JSON.parse(process.env.VCAP_SERVICES);
	for(var i in servicesObject){
		if(i.indexOf("ibm-blockchain") >= 0){											//looks close enough
			if(servicesObject[i][0].credentials.error){
				console.log("!\n!\n! Error from Bluemix: \n", servicesObject[i][0].credentials.error, "!\n!\n");
				peers = null;
				users = null;
				process.error = {type: "network", msg: "Due to overwhelming demand the IBM Blockchain Network service is at maximum capacity.  Please try recreating this service at a later date."};
			}
			if(servicesObject[i][0].credentials && servicesObject[i][0].credentials.peers){
				console.log("overwritting peers, loading from a vcap service: ", i);
				peers = servicesObject[i][0].credentials.peers;
				if(servicesObject[i][0].credentials.users){
					console.log("overwritting users, loading from a vcap service: ", i);
					users = servicesObject[i][0].credentials.users;
				} 
				else users = null;														//no security
				break;
			}
		}
	}
}


// ==================================
// configure ibm-blockchain-js sdk
// ==================================

var options = JSON.parse(fs.readFileSync(__dirname + "/options.json", "utf8"));
options.network.peers = peers;
options.network.users = users;

ibc.switchPeer(0);
ibc.load(options, function(err,data){

	if(err){
		console.log("Error : ", err);
	}else{
		data.details.deployed_name = options.chaincode.deployed_name;
		cb_ready(err,data);
	}
});																//parse/load chaincode

var chaincode = {};

function cb_ready(err, cc){																	//response has chaincode functions
	if(err){
		console.log("! looks like an error loading the chaincode, app will fail\n", err);
		if(!process.error) process.error = {type: "load", msg: err.details};				//if it already exist, keep the last error
	}
	else{
		chaincode = cc;
		console.log(chaincode);
		wsInteraction.setup(ibc, cc);
		router.setup(ibc, cc);
		
		console.log("cc.details.deployed_name"+ cc.details.deployed_name);

		if(!cc.details.deployed_name || cc.details.deployed_name === ""){												//decide if i need to deploy
			cc.deploy("init", [], {save_path: "./cc_summaries", delay_ms: 60000}, cb_deployed);
		}
		else{
			console.log("chaincode summary file indicates chaincode has been previously deployed");
			cb_deployed();
		}
	}
}

app.use("/", router);
// ============================================================================================================================
// 												WebSocket Communication Madness
// ============================================================================================================================
function cb_deployed(e, d){
	if(e != null){
		console.log("! looks like a deploy error, holding off on the starting the socket\n", e);
		if(!process.error) process.error = {type: "deploy", msg: e.details};
	}
	else{
		console.log("------------------------------------------ Websocket Up ------------------------------------------");
		//ibc.save(__dirname + "/cc_summaries");															//save it here for chaincode investigator
		var wss = new ws.Server({server : server});												//start the websocket now
		
		//var wss = new ws.Server({ port: 80 });
 
		
		wss.on("connection", function connection(ws) {
			ws.on("message", function incoming(message) {
				console.log("received ws msg:", message);
				var data = JSON.parse(message);
				//var finInst = null
				parseCookie(ws.upgradeReq, null, function(err) {
			        var sessionID = ws.upgradeReq.signedCookies["connect.sid"];
			        sessionStore.get(sessionID, function(err, sess) {
				    	if(sess){
				    		wsInteraction.process_msg(ws, data, sess.username);
				    	}
				    });
			    }); 
			});
			
			ws.on("close", function(){});
		});
		
		wss.broadcast = function broadcast(data) {											//send to all connections
			wss.clients.forEach(function each(client) {
				console.log("client : ", client);
				try{
					data.v = "2";
					client.send(JSON.stringify(data));
				}
				catch(e){
					console.log("error broadcast ws", e);
				}
			});
		};
		
		// ========================================================
		// Part 2 Code - Monitor the height of the blockchain
		// =======================================================
		ibc.monitor_blockheight(function(chain_stats){										//there is a new block, lets refresh everything that has a state

			if(chain_stats && chain_stats.height){
				console.log("hey new block, lets refresh and broadcast to all");
				ibc.block_stats(chain_stats.height - 1, cb_blockstats);
				wss.broadcast({msg: "reset"});
			}
			
			//got the block's stats, lets send the statistics
			function cb_blockstats(e, stats){
				if(chain_stats.height) stats.height = chain_stats.height - 1;
				wss.broadcast({msg: "chainstats", e: e, chainstats: chain_stats, blockstats: stats});
			}
			

		});
	}
}



// ==================================
// configure ibm-blockchain-js sdk for Parts chain(side chain)
// ==================================
/*
var ibc_parts = new Ibc1();

var manual_parts = JSON.parse(fs.readFileSync(__dirname + "/data_parts.json", "utf8"));


var peers_parts = manual_parts.credentials.peers;

var users_parts = manual_parts.credentials.users;																		//users are only found if security is on

var options_parts = JSON.parse(fs.readFileSync(__dirname + "/options_parts.json", "utf8"));
options_parts.network.peers = peers_parts;
options_parts.network.users = users_parts;

ibc_parts.switchPeer(0);
ibc_parts.load(options_parts, function(err,data){

	if(err){
		console.log("Error : ", err);
	}else{
		data.details.deployed_name = options_parts.chaincode.deployed_name;
		cb_ready_parts(err,data);
	}
});																//parse/load chaincode

var chaincode_parts = {};

function cb_ready_parts(err, cc){																	//response has chaincode functions
	if(err){
		console.log("! looks like an error loading the chaincode, app will fail\n", err);
		if(!process.error) process.error = {type: "load", msg: err.details};				//if it already exist, keep the last error
	}
	else{
		chaincode_parts = cc;
		console.log(chaincode_parts);
		wsInteraction.setupParts(ibc_parts, cc);
		router.setupParts(ibc_parts, cc);
		
		console.log("cc.details.deployed_name"+ cc.details.deployed_name);

		if(!cc.details.deployed_name || cc.details.deployed_name === ""){												//decide if i need to deploy
			cc.deploy("init", [], {save_path: "./cc_summaries", delay_ms: 60000}, cb_deployed_parts);
		}
		else{
			console.log("chaincode_parts summary file indicates chaincode_parts has been previously deployed");
			cb_deployed_parts();
		}
	}
}

app.use("/", router);
// ============================================================================================================================
// 												WebSocket Communication Madness
// ============================================================================================================================
function cb_deployed_parts(e, d){
	if(e != null){
		console.log("! looks like a deploy error, holding off on the starting the socket\n", e);
		if(!process.error) process.error = {type: "deploy", msg: e.details};
	}
	else{
		console.log("------------------------------------------ Websocket Up ------------------------------------------");
		//ibc_parts.save(__dirname + "/cc_summaries");															//save it here for chaincode_parts investigator
		/*
		var wss = new ws.Server({server : server});												//start the websocket now
		
		//var wss = new ws.Server({ port: 80 });
						
		wss.on("connection", function connection(ws) {
			ws.on("message", function incoming(message) {
				console.log("received ws msg:", message);
				var data = JSON.parse(message);
				//var finInst = null
				parseCookie(ws.upgradeReq, null, function(err) {
			        var sessionID = ws.upgradeReq.signedCookies["connect.sid"];
			        sessionStore.get(sessionID, function(err, sess) {
				    	if(sess){
				    		//////wsInteraction.process_msg(ws, data, sess.username);
				    	}
				    });
			    }); 
			});
			
			ws.on("close", function(){});
		});
		
		wss.broadcast = function broadcast(data) {											//send to all connections
			wss.clients.forEach(function each(client) {
				console.log("client : ", client);
				try{
					data.v = "2";
					client.send(JSON.stringify(data));
				}
				catch(e){
					console.log("error broadcast ws", e);
				}
			});
		};
		
		// ========================================================
		// Part 2 Code - Monitor the height of the blockchain
		// =======================================================
		ibc_parts.monitor_blockheight(function(chain_stats){										//there is a new block, lets refresh everything that has a state

			if(chain_stats && chain_stats.height){
				console.log("hey new block, lets refresh and broadcast to all");
				ibc_parts.block_stats(chain_stats.height - 1, cb_blockstats);
				wss.broadcast({msg: "reset"});
			}
			
			//got the block's stats, lets send the statistics
			function cb_blockstats(e, stats){
				if(chain_stats.height) stats.height = chain_stats.height - 1;
				wss.broadcast({msg: "chainstats", e: e, chainstats: chain_stats, blockstats: stats});
			}
			

		});

		////////
	}
}

*/