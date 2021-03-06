/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/
var assert = require("assert");
var fs = require('fs');
var path = require('path');
var lconfig = require('lconfig');
var wrench = require('wrench');
var is = require("lutil").is;
var logger = require("logger");
var util = require('util');
var url = require('url');
var indexPath;

exports.currentEngine;

function noop() {
}

NullEngine = function()
{
}
NullEngine.prototype.indexType = function(type, id, obj, cb) {
    cb("Null engine");
};
NullEngine.prototype.queryAll = function(q, params, cb) {
    cb("Null engine");
};
NullEngine.prototype.queryType = function(type, q, params, cb) {
    cb("Null engine");
};
NullEngine.prototype.name = function() {
    return "Null engine";
};
NullEngine.prototype.flushAndCloseWriter = function() {
};

CLEngine = function()
{
    this.engine = require('clucene');
    this.cl = this.engine.CLucene;
    this.lucene = new this.cl.Lucene();
    this.mappings = {
        "contactcontacts" : {
            "name":"name",
            "nicknames":[],
            "accounts":{
                "twitter":[
                    {
                        "data":{
                            "description":"description"
                        }
                    }
                ]
            },
            "email":[
                {
                    "value":"value"
                }
            ],
            "im":[
                {
                    "value":"value"
                }
            ],
            "address":[
                {
                    "value":"value"
                }
            ]
        },
        "photophotos" : {
            "caption":"caption",
            "title":"title"
        },
        "tweettwitter" : {
            "text":"text",
            "user":{
                "name":"name",
                "screen_name":"screen_name"
            }
        },
        "timelinetwitter" : {
            "text":"text",
            "user":{
                "name":"name",
                "screen_name":"screen_name"
            }
        },
        "postfacebook" : {
            "description":"description",
            "message":"message",
            "from":{
                "name":"name"
            }
        },
        "placeplaces" : {
            "title":"title"
        },
    };

    this.engine.Store = {
      STORE_YES: 1,
      STORE_NO: 2,
      STORE_COMPRESS: 4
    };

    this.engine.Index = {
      INDEX_NO: 16,
      INDEX_TOKENIZED: 32,
      INDEX_UNTOKENIZED: 64,
      INDEX_NONORMS: 128,
    };

    this.engine.TermVector = {
      TERMVECTOR_NO: 256,
      TERMVECTOR_YES: 512,
      TERMVECTOR_WITH_POSITIONS: 512 | 1024,
      TERMVECTOR_WITH_OFFSETS: 512 | 2048,
      TERMVECTOR_WITH_POSITIONS_OFFSETS: (512 | 1024) | (512 | 2048)
    };

    return this;
};

CLEngine.prototype.indexType = function(type, id, value, callback) {
    var doc = new this.cl.Document();

    if (!id) {
        callback("No valid id property was found");
        return;
    }

    if (!this.mappings.hasOwnProperty(type)) {
        callback("No valid mapping for the type: " + type);
        return;
    }

    var contentTokens = [];
    processValue = function(v, parentMapping) {
        if (is("Array", v)) {
            for(var i = 0, l = v.length; i < l; i++) {
                var nextValue = v[i];
                if (is("Object", nextValue) || is("Array", nextValue)) {
                    // XXX:  This only supports a single type in the array right now
                    processValue(v[i], parentMapping[0]);
                } else {
                    processValue(v[i], undefined);
                }
            }
        } else if (is("Object", v)) {
            for (var k in parentMapping) {
                if (k === "_id") continue;
                subMapping = parentMapping[k];
                valueKey = subMapping;
                if (is("Array", subMapping) || is("Object", subMapping)) valueKey = k;
                if (!v.hasOwnProperty(valueKey)) continue;
                processValue(v[valueKey], subMapping);
            }
        } else {
            if (v) contentTokens.push(v.toString());
        }

    };
    processValue(value, this.mappings[type]);

    if (contentTokens.length === 0) {
        logger.verbose("No valid tokens were found to index id " + id);
        return callback(null, 0, 0);
    }

    var contentString = contentTokens.join(" <> ");
    //logger.debug("Going to store " + contentString);
    doc.addField("_type", type, this.engine.Store.STORE_YES|this.engine.Index.INDEX_UNTOKENIZED);
    doc.addField('content', contentString, this.engine.Store.STORE_NO|this.engine.Index.INDEX_TOKENIZED);
    //logger.debug('about to index at ' + indexPath);
    assert.ok(indexPath);
    this.lucene.addDocument(id, doc, indexPath, function(err, indexTime) {
        callback(err, indexTime);
    });
};
CLEngine.prototype.deleteDocument = function(id, callback) {
    assert.ok(indexPath);
    this.lucene.deleteDocument(id, indexPath, callback);
};
CLEngine.prototype.deleteDocumentsByType = function(type, callback) {
    assert.ok(indexPath);
    this.lucene.deleteDocumentsByType(type, indexPath, callback);
};
CLEngine.prototype.queryType = function(type, query, params, callback) {
    assert.ok(indexPath);
    var self = this;
// caused worse problems over time, memory corruption
//    this.lucene.deleteDocument("", indexPath, function(){
        self.flushAndCloseWriter();
        self.lucene.search(indexPath, "content:(" + query + ") AND +_type:" + type, callback);
//    });
};
CLEngine.prototype.queryAll = function(query, params, callback) {
    assert.ok(indexPath);
    this.flushAndCloseWriter();
    this.lucene.search(indexPath, "content:(" + query + ")", callback);
};
CLEngine.prototype.name = function() {
    return "CLEngine";
};
CLEngine.prototype.flushAndCloseWriter = function() {
    this.lucene.closeWriter();
};


exports.setEngine = function(engine) {
    if (engine === undefined) {
        logger.error("Falling back to search Null Engine, your indexing and queries will not work.");
        exports.currentEngine = new NullEngine();
        return;
    }
    if (exports.currentEngine) exports.currentEngine = undefined;
    try {
        exports.currentEngine = new engine();
    } catch (E) {
        logger.error("Falling back to search Null Engine, your indexing and queries will not work. (" + E + ")");
        exports.currentEngine = new NullEngine();
    }
};

exports.setIndexPath = function(newPath) {
    indexPath = newPath;
    if (!path.existsSync(indexPath)) {
      fs.mkdirSync(indexPath, 0755);
    };

};

function exportEngineFunction(funcName) {
    var funcToRun = function() {
        assert.ok(exports.currentEngine);
        exports.currentEngine[funcName].apply(exports.currentEngine, arguments);
    };
    exports[funcName] = funcToRun;
}
exportEngineFunction("queryType");
exportEngineFunction("queryAll");
exportEngineFunction("flushAndCloseWriter");

// Indexing Parts Be Here
var indexQueue = [];
var indexing = false;

exports.indexType = function(type, id, value, cb) {
    indexQueue.push({"type":type, "id":id, "value":value, "cb":cb});
    process.nextTick(indexMore);
};

exports.deleteDocument = function(id, cb) {
  exports.currentEngine.deleteDocument(id, cb);
};

exports.deleteDocumentsByType = function(type, cb) {
  exports.currentEngine.deleteDocumentsByType(type, cb);
}

// CAREFUL!  Make sure all your readers/writers are closed before calling this
exports.resetIndex = function(callback) {
    try {
        wrench.rmdirSyncRecursive(indexPath);
        callback(null)
    } catch (E) {
        if (E.code == "ENOENT") return callback(null);
        callback(E);
    }
};

function indexMore(keepGoing) {
    // I still feel like async can break this unless there's some sort of atomic guarantee
    if (indexing && !keepGoing) return;
    indexing = true;
    //logger.debug('IndexQueue length: ' + indexQueue.length);
    if (indexQueue.length === 0) {
        indexing = false;
        return;
    }
    var cur = indexQueue.shift();
    assert.ok(exports.currentEngine);
    exports.currentEngine.indexType(cur.type, cur.id, cur.value, function(err, indexTime) {
        cur.cb(err, indexTime);
        delete cur;
        cur = null;
        //logger.debug("Setting up for next tick");
        // TODO: review for optimization per ctide comment (per 100 instead of per 1?)
        process.nextTick(function() { indexMore(true); });
    });
}

exports.engines = {
    "CLucene" : CLEngine,
    "ElasticSearch" : undefined // ESEngine
};

