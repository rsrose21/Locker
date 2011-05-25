/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var IJOD = require('../../Common/node/ijod').IJOD;
var sqlite = require('sqlite');

// var INDEXED_FIELDS = [{fieldName:'timeStamp', fieldType:'REAL'}, {fieldName:'data.id', fieldType:'REAL'}];

var people = {};
var statuses = {};
var currentDB = new sqlite.Database();
exports.init = function(callback) {
    if(!people.followers && ! people.friends) {
        people.followers = new IJOD('followers');
        people.friends = new IJOD('friends');
        statuses.home_timeline = new IJOD('home_timeline');
        statuses.user_timeline = new IJOD('user_timeline');
        statuses.mentions = new IJOD('mentions');
        people.followers.init(function() {
            people.friends.init(function() {
                statuses.home_timeline.init(function() {
                    statuses.user_timeline.init(function() {
                        statuses.mentions.init(function() {
                            openDB(callback);
                        });
                    });
                });
            });
        });
    } else {
        callback();
    }
}

function openDB(callback) {
    currentDB.open('current.db', function(err) {
        currentDB.execute('CREATE TABLE friends (id INTEGER PRIMARY KEY, profile TEXT);', function(err) {
            currentDB.execute('CREATE TABLE followers (id INTEGER PRIMARY KEY, profile TEXT);', callback);      
        });
    });
}

function now() {
    return new Date().getTime();
}

exports.addPerson = function(type, person, callback) {
    var status = person.status;
    delete person.status;
    people[type].addRecord(person.id, now(), person, function(err) {
        person.status = status;
        addPersonToCurrent(type, person, callback);
    });
}

exports.getPersonFromCurrent = function(type, id, callback) {
    if(type != 'friends' && type != 'followers') {
        callback(new Error('invalid type:' + type));
        return;
    }
    var sql = "SELECT profile FROM " + type + " WHERE id = ?;";
    currentDB.execute(sql, [id], callback);
}

// function getPeopleFromCurrent()

function addPersonToCurrent(type, person, callback) {
    if(type != 'friends' && type != 'followers') {
        callback(new Error('invalid type:' + type));
        return;
    }
    var sql = "INSERT OR REPLACE INTO " + type + "(id, profile) VALUES (?, ?);";
    currentDB.execute(sql, [person.id, JSON.stringify(person)], callback);
}

exports.logRemovePerson = function(type, id, callback) {
    people[type].addRecord(parseInt(id), now(), {id_str:id, id:parseInt(id)}, function(err) {
        removePersonFromCurrent(type, id, callback);
    });
}

function removePersonFromCurrent(type, id, callback) {
    if(type != 'friends' && type != 'followers') {
        callback(new Error('invalid type:' + type));
        return;
    }
    if(typeof id !== 'number') {
        id = parseInt(id);
    }
    var sql = "DELETE FROM " + type + " WHERE id = ?;";
    currentDB.execute(sql, [id], callback);
}

exports.logUpdatePerson = function(type, person) {
    var status = person.status;
    delete person.status;
    people[type].addRecord(person.id, now(), person, function(err) {
        person.status = status;
        updatePersonInCurrent(type, person, function(err) {
            if(err)
                console.error(err);
        });
    });
}

function updatePersonInCurrent(type, person, callback) {
    if(type != 'friends' && type != 'followers') {
        callback(new Error('invalid type:' + type));
        return;
    }
    var sql = "UPDATE " + type + " SET profile = ? WHERE id = ?;";
    currentDB.execute(sql, [JSON.stringify(person), person.id], callback);
}


exports.getPeople = function(type, timeStamp, callback) {
    var ijod = people[type];
    if(!callback && typeof timeStamp == 'function') {
        callback = timeStamp;
        timeStamp = 0;
    }
    ijod.getAfterTimeStamp(timeStamp, callback);
}

exports.getPeopleCurrent = function(type, callback) {
    currentDB.execute('SELECT profile FROM ' + type + ';', function(err, profileStrs) {
        if(err) {
            callback(err, profileStrs);
            return;
        }
        var profiles = [];
        for(var i in profileStrs) {
            try {
                profiles.push(JSON.parse(profileStrs[i].profile));
            } catch(err) {
                console.error(err);
            }
        }
        callback(err, profiles);
    });
}

exports.getAllContacts = function(callback) {
    exports.getPeople('friends', {recordID:-1}, function(err, friends) {
        var allContacts = {friends:friends};
        exports.getPeople('followers', {recordID:-1}, function(err, followers) {
            allContacts.followers = followers;
            callback(null, allContacts);
        });
    });
}

exports.addStatus = function(type, status) {
    statuses[type].addRecord(status.id, new Date(status.created_at).getTime(), status, function() {
        
    });
}

exports.getStatuses = function(type, timeStamp, callback) {
    var ijod = statuses[type];
    if(!callback && typeof timeStamp == 'function') {
        callback = timeStamp;
        timeStamp = 0;
    }
    ijod.getAfterTimeStamp(timeStamp, callback);
}