
//Packages
const Discord = require("discord.js");
const Attachment = require("discord.js");
const client = new Discord.Client();
const ytdl = require("ytdl-core");
const request = require("request");
const fs = require("fs");
const getYoutubeId = require("get-youtube-id");
const fetchVideoInfo = require("youtube-info");
const AWS = require('aws-sdk');

var s3 = new AWS.S3();
var translate = new AWS.Translate({ region: "us-east-2" });
var config = JSON.parse(fs.readFileSync('./settings.json', 'utf-8'));

//Config
const yt_api_key = config.yt_api_key;
const bot_controller = config.bot_controller;
const prefix = config.prefix;
const discord_token = config.discord_token;

//Variables
var queue = [];
var queueNames = [];
var isPlaying = false;
var dispatcher = null;
var voiceChannel = null;

var myip = require('quick-local-ip');

//Login to discord server
client.login(discord_token);

//If bot is logged and on
client.on('message', function (message) {

    const member = message.member; //The person who sends the message on de discord server.
    const mess = message.content.toLowerCase(); //The message content.

    const args = message.content.slice(prefix.length).trim().split(/ +/g); //We get the arguements of the command.
    const argsMusic = message.content.split(' ').slice(1).join(""); //The command to play music needs less arguements.
    const command = args.shift().toLowerCase(); //The command itself.

    //If command is play, you play music.
    if (command === "play") {

        //The member has to be in a voice channel to be able to listen to music so if the member is in a voice channel.
        if (message.member.voiceChannel || message.member.voiceChannel != null) {

            //If there is a song playing already or there are songs in the queue.
            if (queue.length > 0 || isPlaying) { 
                getId(argsMusic, function (id) { //Get the video with the command arguements (youtube link or name of the song).
                    add_to_queue(id, message); //Add song to queue.
                    fetchVideoInfo(id, function (err, videoInfo) { //Here we get the video title.
                        if (err) throw new Error(err);
                        message.reply(" added to queue: **" + videoInfo.title + "**"); //Send message from the bot to the server displaying the song title.
                        queueNames.push(videoInfo.title); //Push video title to queue.
                    });
                });

            //If there are no songs playing or on queue.
            } else { 
                isPlaying = true; //Song is playing.
                getId(argsMusic, function (id) { //Get the youtube link.
                    queue.push(id);
                    playMusic(id, message);
                    fetchVideoInfo(id, function (err, videoInfo) { //Get youtube video title.
                        if (err) throw new Error(err);
                        queueNames.push(videoInfo.title);
                        message.reply(" now playing: **" + videoInfo.title + "**"); //Send message of the song playing.
                    });
                });
            }

        //If the member that send the message with the command is not in a voicechannel.
        } else {
            message.reply(" you need to be in a voice channel! :warning:"); //Send a message as a warning.
        }

    //If command is translate, you translate a text (Using Translate Amazon API).
    } else if (command == "translate") {

        //Command format, example: !translate en es text.
        var tempCommand = message.content.replace(command, "");//We eliminate the command so we get: en es.
        var tempArgs1 = tempCommand.replace(args[0], "");//Get the message language: en.
        var tempArgs2 = tempArgs1.replace(args[1], "");//Get the language that the text will be translated to: es.
        var text = tempArgs2.replace(config.prefix, "");//Get the text that will be translated: text.
    
        //Params for the Amazon Translate API.
        var params = {
            "Text": text,
            "SourceLanguageCode": args[0],
            "TargetLanguageCode": args[1]
        };

        //Get the text translated from the response, send it as a message and if there is an error print error stack.
        translate.translateText(params, function (err, data) {

            if (err)
                console.log("There was an error translating " + err.stack);
            if (data) {
                console.log(data);
                message.reply( args[1] + ": " + data.TranslatedText);
            }
        });

    //If command is a meme, we use a S3 bucket to store the images.
    } else if (command == "meme") {

        //Params for the S3 call.
        var params = {
            Bucket: "", //Name of the bucket.
            MaxKeys: 100
        };

        //Get the list of the objects stored in the S3 bucket.
        s3.listObjects(params, function (err, data) {

            if (err) console.log(err, err.stack);
            else {

                //Random number generated from 0 to the number of images in the S3 bucket.
                var randomIndex = Math.trunc(Math.random() * (data.Contents.length - 1));
                //Get the random image and attach it to a discord message.
                const attachment = new Discord.Attachment("https://s3.us-east-2.amazonaws.com/memes-reromero/" + data.Contents[randomIndex].Key);  

                //Send message with the image attached.
                message.reply(attachment);
            }

        });

    //If command is skip, then skip song.
    } else if(command == "skip"){

        skip_song(message);
        message.reply(" skipping now!");
    
    //If command is queue, add song to queue.    
    } else if (command == "queue"){

        //Format for response message:
        var message2 = "```";
        for (var i = 0; i < queueNames.length; i++) {
            var temp = (i + 1) + ": " + queueNames[i] + (i === 0 ? "**(Current Song)**" : "") + "\n"; //The song that is playing right now.
            if ((message2 + temp).length <= 2000 - 3) {
                message2 += temp;
            } else {
                message2 += "```";
                message.channel.send(message2);
                message2 = "```";
            }
        }
        message2 += "```";
        message.channel.send(message2);

    } else if (command == "server"){
        message.reply(myip.getLocalIP4());
    } else if(command == "stop"){

        dispatcher.end();
        message.member.voiceChannel.leave();
        message.reply(" stopping music...");
    }else if(command === "addrole"){

        var role = message.guild.roles.find(r => r.name === args[0]);

        // Let's pretend you mentioned the user you want to add a role to (!addrole @user Role Name):
        var memberMentioned = message.mentions.members.first();
        // or the person who made the command: let member = message.member;

        memberMentioned.addRole(role.id);
        
        message.reply(" role added:bangbang:");

    } else if (command === "removerole") {
        var role = message.guild.roles.find(r => r.name === args[0]);

        // Let's pretend you mentioned the user you want to add a role to (!addrole @user Role Name):
        var memberMentioned = message.mentions.members.first();
        // or the person who made the command: let member = message.member;

        memberMentioned.removeRole(role.id);

        message.reply(" role removed! :x:");

    }
});

client.on("guildMemberAdd", (member) => {

    const guild = member.guild;
    const defaultChannel = guild.channels.find(channel => channel.name == "welcome");

    defaultChannel.send("Welcome to the best server ever <@" + member.user.id + ">:bangbang: :tada::tada::tada:");

});

client.on('ready', function () {

    console.log("I am ready");

});

function add_to_queue(strId) {

    if (isYoutube(strId))
        queue.push(getYoutubeId(strId));
    else
        queue.push(strId);
}

function search_video(query, callback) {
    request("https://www.googleapis.com/youtube/v3/search?part=id&type=video&q=" + encodeURIComponent(query) + "&key=" + yt_api_key, function (error, response, body) {
        var json = JSON.parse(body);
        if (!json.items[0]) callback("3_-a9nVZYjk");
        else {
            callback(json.items[0].id.videoId);
        }
    });
}

function isYoutube(str) {

    return str.toLowerCase().indexOf("youtube.com") > -1;
}

function getId(str, cb) {

    if (isYoutube(str)) {
        cb(getYoutubeId(str));
    } else {
        search_video(str, function (id) {

            cb(id);

        });
    }

}

function playMusic(id, message) {
    voiceChannel = message.member.voiceChannel;

    voiceChannel.join().then(function(connection) {
        stream = ytdl("https://www.youtube.com/watch?v=" + id, {
            filter: 'audioonly'
        });

        dispatcher = connection.playStream(stream);
        dispatcher.on('end', function() {
            queue.shift();
            if (queue.length === 0) {
                queue = [];
                isPlaying = false;
            } else {
                    playMusic(queue[0], message);
                
            }
        });
    });
}

function skip_song(message) {
    dispatcher.end();
}


