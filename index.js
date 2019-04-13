var fs = require('fs');
var path = require('path');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var util = require('util');
var session = require("express-session")({
        secret: "my-secret",
        resave: true,
        saveUninitialized: true
    });
var sharedsession = require("express-socket.io-session");

app.set('views', path.join(__dirname, 'views'));

app.use('/js', express.static(__dirname + '/public/js'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js')); // redirect bootstrap JS
app.use('/css', express.static(__dirname + '/public/css')); // redirect CSS bootstrap
app.use('/fonts', express.static(__dirname + '/public/fonts'));
app.use(session);

app.get('/', function(req, res){
	res.sendFile(__dirname + '/views/page.html');
});

app.get('/destroy', function (req, res) {
    req.session.destroy();
	res.redirect('/');
})

var server_port = process.env.PORT || 8080;
var server = app.listen(server_port, function(){
	console.log("Listening on " 
           + ", server_port " + server_port);
});

var io = require('socket.io')(server);
io.use(sharedsession(session));

var users = [];
var rooms = [];
io.on('connection',function(socket){
	//##### SOCKET INIT
	console.log('socket connected');
	users.push(socket);
	//##### SOCKET EVENTS
	socket.on('disconnect',function(){
		console.log('socket disconnected');
		var index = users.indexOf(socket);
		if (index > -1) {
			users.splice(index, 1);
			if(typeof socket.roomName !== 'undefined' && socket.roomName != 'lobby'){
				checkRoomAndDelete(socket.roomName, socket);
			}
		}
	});
    
    socket.on('checkUserStatus', function(){
        if(typeof socket.handshake.session.userName !== 'undefined'){
            socket.userName = socket.handshake.session.userName;
            socket.roomName = 'lobby';
            socket.join('lobby');
            socket.emit('goToLobby', socket.userName);
        }
    });
	
	//##### getRoomList event
	socket.on('getRoomList',function(){
		socket.emit('hereAreTheRooms', rooms);
	});
	
	//#### userRegister event
	socket.on('registerUser',function(name){
        if(name == ''){
            socket.emit('someError', 'User Name cannot be empty');
            return;
        }
		var userExists = 0;
		users.forEach(function(item){
			if(item.userName == name){
				userExists = 1;
            }
		});
		if(userExists == 0){
            socket.handshake.session.userName = name;
            socket.handshake.session.save();
			socket.userName = name;
			socket.roomName = 'lobby';
			socket.join('lobby');
			socket.emit('goToLobby', name);
		} else{
			socket.emit('someError', 'User already registered');
		}
	});
	
	socket.on('getConnectedUsers', function(){
		socket.emit('connectedUsersList', getConnectedUsersFromRoom(socket.roomName));
	});
	
	socket.on('createRoom', function(roomName){
		if(roomName != ''){
			var index = rooms.indexOf(roomName);
			if(index == -1){
				rooms.push(roomName);
				socket.leave('lobby');
				socket.join(roomName);
				socket.roomName = roomName;
				socket.roomAdmin = true;
				socket.emit('adminGoToRoom', roomName);
				io.to(roomName).emit('connectedUsersList', getConnectedUsersFromRoom(roomName));
			} else{
				socket.emit('someError', 'Room already exists');
			}
		} else {
			socket.emit('someError', 'Room name cannot be empty');
		}
	});
	
	socket.on('joinRoom', function(roomName){
		if(roomName != ''){
			var index = rooms.indexOf(roomName);
			if(index != -1){
				socket.leave('lobby');
				socket.join(roomName);
				socket.roomName = roomName;
				socket.roomAdmin = false;
				socket.emit('userGoToRoom', roomName);
				io.to(roomName).emit('userJoinedRoom', socket.userName);
			} else{
				socket.emit('someError', 'Room does not exist');
			}
		} else{
			socket.emit('someError', 'Room name cannot be empty');
		}
	});
	
	socket.on('start', function(){
		startQuiz(socket.roomName);
		socket.emit('connectedUsersList', getConnectedUsersFromRoom(socket.roomName));
	});
	
	socket.on('leaveRoom', function(roomName){		//leave room means return to lobby
		checkRoomAndDelete(roomName, socket);
	});
	
	socket.on('sendAnswers', function(answers){
		sendAnswersToAdminOfRoom(answers, socket);
	});
});

function getConnectedUsersFromRoom(roomName){
	var connectedUsers = [];
	users.forEach(function(item){
		if(item.roomName == roomName && item.roomAdmin == false){
			connectedUsers.push(item.userName);
		}
	});
	return connectedUsers;
}

function checkRoomAndDelete(roomName, socket){
	if(socket.roomAdmin == true){
		console.log('admin a iesit');
	} else{
		console.log('un user a iesit');
	}
	socket.leave(roomName);
	socket.join('lobby');
	socket.roomName = 'lobby';
	socket.emit('goToLobby', socket.userName);
	io.to(roomName).emit('userLeftRoom', socket.userName);
	
	var usersInRoom = 0;
	users.forEach(function(item){
		if(item.roomName == roomName)
			usersInRoom ++;
	});
	if(usersInRoom == 0){		
		var index = rooms.indexOf(roomName);	
		rooms.splice(index,1);
	}
}

function sendAnswersToAdminOfRoom(answers, socket){
	users.forEach(function(user){
		if(user.roomName == socket.roomName && user.roomAdmin == true){
			user.emit('somebodySentAnswers', socket.userName, answers);
		}
	});
}

function startQuiz(roomName){
	users.forEach(function(user){
		if(user.roomName == roomName && user.roomAdmin == false){
			user.emit('getAnswers');
		}
	});
}
