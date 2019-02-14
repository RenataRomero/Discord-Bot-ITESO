
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

//Login al server
client.login(discord_token);

client.on('message', function (message) {

    const member = message.member;
    const mess = message.content.toLowerCase();

    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const argsMusic = message.content.split(' ').slice(1).join("");
    const command = args.shift().toLowerCase();

    if (command === "play") {

        if (message.member.voiceChannel || message.member.voiceChannel != null) {
            if (queue.length > 0 || isPlaying) {
                getId(argsMusic, function (id) {
                    add_to_queue(id, message);
                    fetchVideoInfo(id, function (err, videoInfo) {
                        if (err) throw new Error(err);
                        message.reply(" added to queue: **" + videoInfo.title + "**");
                        queueNames.push(videoInfo.title);
                    });
                });
            } else {
                isPlaying = true;
                getId(argsMusic, function (id) {
                    queue.push(id);
                    playMusic(id, message);
                    fetchVideoInfo(id, function (err, videoInfo) {
                        if (err) throw new Error(err);
                        queueNames.push(videoInfo.title);
                        message.reply(" now playing: **" + videoInfo.title + "**");
                    });
                });
            }
        } else {
            message.reply(" you need to be in a voice channel! :warning:");
        }

    } else if (command == "translate") {

        var tempCommand = message.content.replace(command, "");
        var tempArgs1 = tempCommand.replace(args[0], "");
        var tempArgs2 = tempArgs1.replace(args[1], "");
        var text = tempArgs2.replace(config.prefix, "");
    
        var params = {
            "Text": text,
            "SourceLanguageCode": args[0],
            "TargetLanguageCode": args[1]
        };

        translate.translateText(params, function (err, data) {

            if (err)
                console.log("There was an error translating " + err.stack);
            if (data) {
                console.log(data);
                message.reply( args[1] + ": " + data.TranslatedText);
            }
        });

    } else if (command == "meme") {

        var params = {
            Bucket: "memes-reromero",
            MaxKeys: 100
        };

        s3.listObjects(params, function (err, data) {

            if (err) console.log(err, err.stack);
            else {

                var randomIndex = Math.trunc(Math.random() * (data.Contents.length - 1));
                const attachment = new Discord.Attachment("https://s3.us-east-2.amazonaws.com/memes-reromero/" + data.Contents[randomIndex].Key);  

                message.reply(attachment);
            }

        });
    } else if(command == "skip"){

        skip_song(message);
        message.reply(" skipping now!");

    } else if (command == "queue"){

        var message2 = "```";
        for (var i = 0; i < queueNames.length; i++) {
            var temp = (i + 1) + ": " + queueNames[i] + (i === 0 ? "**(Current Song)**" : "") + "\n";
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


