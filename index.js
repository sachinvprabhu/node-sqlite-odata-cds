const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const jsonxml = require('jsontoxml');

const odata = require('./dataservice');

//const routes = require('express').Router();


module.exports = function(config){
	return function(req,res,next){
		if(req.method === "HEAD" && req.get("x-csrf-token") === "Fetch"){
			res.set("x-csrf-token","CSRFNOTREQUIRED").status(204).send("");
		} else if(req.method === "OPTIONS"){
			res.set("Allow","OPTIONS, HEAD, GET, DELETE, POST, PUT").status(204).send("");
		} else if(req.method === "GET" && req.path === "/"){
			odata.getServiceRoute(config.DATABASE,config.PROJECT).then(function(rootData){
				res.send(rootData);
			}).catch(function(err){
				res.status(500).send(err.message);
			})
		} else if(req.method === "GET" && req.path.match(/([\$])metadata/)){
			odata.metadata(config.DATABASE,config.PROJECT).then(function(metadata){
				res.header('Content-Type', 'application/xml').send(jsonxml(metadata));
			}).catch(function(err){
				res.status(500).send(err.message);
			});
		} else if(req.method === "GET" && req.path.match(/[a-zA-Z0-9_]*Set[\(\)]*\/\$count$/)){
			// getCount
			var table = req.path.match(/[a-zA-Z0-9_]*Set[\(\)]*/).toString().replace(/Set[\(\)]*$/,"");
			
			var uriPrefix = `${req.baseUrl}/${table}Set`;
			
			odata.getCount(config.DATABASE,config.PROJECT, table, uriPrefix, (req.query.$filter||1) +" AND "+ (req.path.match(/\(.+\)/)||1).toString()).then(function(count){
				//inlinecount to be implemented
				res.header('Content-Type', 'text/plain').send(count.toString());
			}).catch(function(err){
				res.status(500).send(err.message);
			});
			
		} else if(req.method === "GET" && req.path.match(/[a-zA-Z0-9_]*Set[\(\)]*$/)){
			// getEntitySet
			var table = req.path.match(/[a-zA-Z0-9_]*Set[\(\)]*$/).toString().replace(/Set[\(\)]*$/,"");
			
			var uriPrefix = `${req.baseUrl}/${table}Set`;
			
			odata.getTableData(config.DATABASE,config.PROJECT, table, uriPrefix, (req.query.$filter||1) +" AND "+ (req.path.match(/\(.+\)/)||1).toString(), req.query.$orderby, req.query.$top, req.query.$skip).then(function(entitySet){
				//inlinecount to be implemented
				if(req.query.$inlinecount === "allpages"){
					entitySet.d.__count = entitySet.d.results.length;
				}
				res.send(entitySet);
			}).catch(function(err){
				res.status(500).send(err.message);
			});
			
		} else if(req.method === "GET" && req.path.match(/[a-zA-Z0-9_]*Set\(.*\)$/)){
			// getEntity
			
			var entity = req.path.match(/[a-zA-Z0-9_]*\(.*\)$/).toString(); // something like "Business_partnersSet(business_partner_number='2')"
			
			var table = entity.match(/[a-zA-Z0-9_]*Set/).toString().replace("Set","");
			
			var key = entity.match(/\(.*\)$/).toString();
			
			var uriPrefix = `${req.baseUrl}/${table}Set${key}`;
			
			odata.getEntry(config.DATABASE,config.PROJECT, table, key, uriPrefix).then(function(entitySet){
				res.send(entitySet);
			}).catch(function(err){
				res.status(500).send(err.message);
			});
			
		}  else if(req.method === "DELETE" && req.path.match(/[a-zA-Z0-9_]*Set\(.*\)$/)){
			// deleteEntity
			
			var entity = req.path.match(/[a-zA-Z0-9_]*\(.*\)$/).toString(); // something like "Business_partnersSet(business_partner_number='2')"
			
			var table = entity.match(/[a-zA-Z0-9_]*Set/).toString().replace("Set","");
			
			var key = entity.match(/\(.*\)$/).toString();
			
			odata.deleteEntry(config.DATABASE,config.PROJECT, table, key).then(function(deletedRows){
				res.status(204).send("");
			}).catch(function(err){
				res.status(500).send(err.message);
			});
			
		} else if(req.method === "POST" && req.path.match(/[a-zA-Z0-9_]*Set[\(\)]*$/)){ // Create entity
		
			var table = req.path.match(/[a-zA-Z0-9_]*Set[\(\)]*$/).toString().replace(/Set[\(\)]*$/,"");
			
			var uriPrefix = `${req.baseUrl}/`;
			
			odata.createEntry(config.DATABASE, config.PROJECT, table, req.body, uriPrefix).then(function(entity){
				res.send(entity);
			}).catch(function(err){
				res.status(500).send(err.message);
			});
			
		} else if((req.method === "PUT" && req.path.match(/[a-zA-Z0-9_]*Set\(.*\)$/))||(req.method === "POST" && req.get("X-HTTP-Method") === "MERGE")){ // Update entity
		
			var entity = req.path.match(/[a-zA-Z0-9_]*\(.*\)$/).toString(); // something like "Business_partnersSet(business_partner_number='2')"
			
			var table = entity.match(/[a-zA-Z0-9_]*Set/).toString().replace("Set","");
			
			var key = entity.match(/\(.*\)$/).toString();
			
			var uriPrefix = `${req.baseUrl}/${table}Set${key}`;
			
			odata.updateEntry(config.DATABASE, config.PROJECT, table, key, req.body, uriPrefix).then(function(entity){
				res.send(entity);
			}).catch(function(err){
				res.status(500).send(err.message);
			});
			
		} else {
			next();
		}
		
	};
};
