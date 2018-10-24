const sqlite3 = require('sqlite3').verbose();
module.exports = function(dbFileName){
	this.dbFileName = dbFileName;
	this.query = function(sql,params){
		return new Promise(function(resolve,reject){
			var db = new sqlite3.Database(this.dbFileName);
			db.all(sql, params, function(err, rows){
				if(err){
					reject(err);
				} else {
					resolve(rows);
				}
			});
			db.close();
		}.bind(this));
	};
	this.get = function(sql,params){
		return new Promise(function(resolve,reject){
			var db = new sqlite3.Database(this.dbFileName);
			db.get(sql, params, function(err, rows){
				if(err){
					reject(err);
				} else {
					resolve(rows);
				}
			});
			db.close();
		}.bind(this));
	};
	
	this.execute = function(sql, params){
		return new Promise(function(resolve,reject){
			var db = new sqlite3.Database(this.dbFileName);
			db.run(sql, params, function(err){
				if(err){
					reject(err);
				} else {
					resolve(this);
				}
			});
			db.close();
		}.bind(this));
	};
}