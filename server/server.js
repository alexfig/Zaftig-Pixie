var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var handlers = require('./request-handlers');
var socketHandlers = require('./socket-handlers');

// Middleware
var parser = require('body-parser');

var port = process.env.PORT || 3000;

// Set what we are listening on.
app.set("port", port);

// Logging and parsing
app.use(parser.json());

// Serve the client files
app.use(express.static(__dirname + "/../client"));

// If we are being run directly, run the server.
if (!module.parent) {
  http.listen(app.get("port"));
  console.log("Listening on", app.get("port"));
}

/*----------  Socket listeners  ----------*/
// When user navigates to website
io.on('connection', function (socket) {

  console.log("\nSOCKET " + socket.id, "connected.\n");
  console.log('This is the users object:\n', socketHandlers.users);

  // When user signs in: emitted from AppView
  socket.on('login', function (data) {
    console.log("\nSOCKET " + socket.id, "logged in.\n");
    socketHandlers.loginUser(data, socket.id);
  });

  // When user wants to join a private game
  socket.on('requestJoinPrivateGame', function (data) {

    // If user is NOT already in game
    if (socketHandlers.users[socket.id].opponent === null) {
      // If friend id is sent, make the match
      if (data.friendId) {
        var matched = socketHandlers.matchPlayers(socket.id, data.friendId);
        // If match is successful
        if (matched) {
          // Look up player names
          var player1Name = socketHandlers.users[socket.id].username;
          var player2Name = socketHandlers.users[data.friendId].username;

          // Emit match event to tell players to start game
          io.to(socket.id).emit('match', { opponentName : player2Name });
          io.to(data.friendId).emit('match', { opponentName : player1Name });
          console.log(player1Name + " and " + player2Name + " told they're matched");

        // If match not successful, tell user
        } else {
          io.to(socket.id).emit('joinPrivateGameDenied',
            { message: "Wrong friend id or friend is in game" });
        }
      // If friend id not sent, give user his socket id so he can give tell it
      // to a friend
      } else {
        io.to(socket.id).emit('waitForFriend', { id: socket.id });
      }
    // User is already in game
    } else {
      io.to(socket.id).emit('joinPrivateGameDenied',
        { message: "You are still in a game" });
    }
  });

  // When user wants to join a game
  socket.on('requestJoinGame', function() {
    // TODO: handle if user is already in game
    socketHandlers.waitForGame(socket.id);
  });

  // When player updates server with score
  socket.on('update', function (data) {
    // Update the player's score
    socketHandlers.updateScore(socket.id, data);

    // Report user's score to the opponent
    var opponentId = socketHandlers.users[socket.id].opponent;
    io.to(opponentId).emit('update', data);

    // Check for end of game
    var result = socketHandlers.checkForEndGame(socket.id, opponentId);

    // Tell players of the results
    if (result) {
      io.to(result['winner']).emit('win');
      io.to(result['loser']).emit('lose');
    }
  });

  // On disconnect
  socket.on('disconnect', function () {
    if (socketHandlers.users[socket.id]) {
      var opponentId = socketHandlers.users[socket.id].opponent;
      // If user has an opponent, report that the opponent won
      if (opponentId) {
        io.to(opponentId).emit('win');
      }
      socketHandlers.removePlayer(socket.id, opponentId);
    }
    console.log("\nSOCKET " + socket.id, "disconnected.");
  });
});

// Match players every 5 seconds
setInterval(function () {
  var matches = socketHandlers.matchAllPlayers();
  /*
    matches = [
      ['dfdfdvs323f', 'dfsdfsv32324'],
      [ 'fs34324243', 'dfsfsfdss234']
    ]
  */
  // If matches are made
  if (matches.length > 0) {
    for (var i = 0; i < matches.length; i++) {
      var player1Id = matches[i][0];
      var player2Id = matches[i][1];
      // Look up player names
      var player1Name = socketHandlers.users[player1Id].username;
      var player2Name = socketHandlers.users[player2Id].username;

      // Emit match event to tell players to start game
      io.to(player1Id).emit('match', { opponentName : player2Name });
      io.to(player2Id).emit('match', { opponentName : player1Name });
      console.log(player1Name + " and " + player2Name + " told they're matched");
    }
  }
}, 5000);

/*----------  Routes  ----------*/

// request user data from database
app.use('/user', handlers.user);

// login user and create session
app.use('/login', handlers.login);

// register a new user to the databse
app.use('/register', handlers.register);

// serve passage to the client
app.use('/text', handlers.text);
