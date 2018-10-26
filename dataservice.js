const database = require('./database');
const underscore = require('underscore');
const datatypeFormatter = require("./datatypes");
const filterParser = require("./filterParser");
module.exports = {
	
	createEntry : function(dbPath, projectName, tableName, data, uriPrefix){
		
		return new Promise(function(resolve,reject){
			var DB = new database(dbPath);
			DB.query(`PRAGMA table_info(${tableName})`).then(function(columns){
				var columnNames = [];
				var values = [];
				var placeholders=[];
				var primaryKeys = [];
				columns.forEach(function(column){
					if(column.pk){
						primaryKeys.push(column.name)
					} else if(data[column.name] !== null && data[column.name] !== undefined ){
						columnNames.push(column.name);
						values.push(data[column.name]);
						placeholders.push("?");
					}
				});
				var query = `INSERT INTO ${tableName}(${columnNames.join(',')}) VALUES(${placeholders.join(',')})`;
				DB.execute(query,values).then(function(response){
					data[primaryKeys[0]] = response.lastID;
					data.__metadata = {
						"uri" : uriPrefix+tableName+"Set("+primaryKeys[0]+"='"+response.lastID+"')",
						"type" : projectName+"."+tableName
					};
					resolve({d:{results:data}});
				}).catch(function(error){
					reject(error);
				});
			}).catch(function(error){
				reject(error);
			})
		});
	},
	
	getEntry : function(dbPath, projectName, tableName, key, uriPrefix){
		return new Promise(function(resolve,reject){
			var DB = new database(dbPath);
			var query = `SELECT * FROM ${tableName} WHERE ${key.replace(/,/g," AND ")}`;
			DB.get(query).then(function(data){
				if(data){
					data.__metadata = {
						"uri" : `${uriPrefix}`,
						"type" : `${projectName}.${tableName}`
					};
					resolve({d:data});
				} else {
					reject(new Error("No Data found"));
				}
			}).catch(function(err){
				reject(err);
			});
		});	
	},
	updateEntry : function(dbPath, projectName, tableName, key, data, uriPrefix){
		var that = this;
		return new Promise(function(resolve,reject){
			var DB = new database(dbPath);
			
			if( key && key.length > 2 ){ // key should not come as '()' // need to check if all key fields are present in key string
				DB.query(`PRAGMA table_info(${tableName})`).then(function(columns){
					debugger;
					var columnNames = [];
					var values = [];
					columns.forEach(function(column){
						//primary keys cannot be updated
						if(!column.pk && data[column.name] !== null && data[column.name] !== undefined ){
							columnNames.push(column.name+"=?");
							values.push(data[column.name]);
						}
					});
					var query = `UPDATE ${tableName} SET ${columnNames.join()} WHERE ${key.replace(/,/g," AND ")}`;
					
					DB.execute(query,values).then(function(response){
						that.getEntry(dbPath, projectName, tableName, key, uriPrefix).then(function(entry){
							resolve(entry);
						}).catch(function(error){
							reject(error);
						})
					}).catch(function(error){
						reject(error)
					});
					
				}).catch(function(error){
					reject(error)
				})
			} else {
				reject(new Error("Invalid Key identifier"));
			}
			
		});	
	},
	deleteEntry : function(dbPath, projectName, tableName, key, uriPrefix){
		return new Promise(function(resolve,reject){
			var DB = new database(dbPath);
			var query = `DELETE FROM ${tableName} WHERE ${key}`;
			DB.execute(query).then(function(statement){
				resolve(statement.changes);
			}).catch(function(err){
				reject(err);
			});
		});
	},
	getTableData : function(dbPath, projectName, tableName, uriPrefix, filters, sorters, top, skip){
		
		return new Promise(function(resolve,reject){
		
			var DB = new database(dbPath);
			
			var filterString = "";
			if(filters){
				//convert filters to where clause here
				filterString = filterParser(filters);
			}
			
			var query = "SELECT * FROM "+tableName+(filterString?(" WHERE "+filterString):"")+(sorters?(" ORDER BY "+sorters):"");
			if(top){
				query+=" LIMIT "+top;
				if(skip){
					query+=" OFFSET "+skip;
				}
			}
			Promise.all([DB.query("PRAGMA table_info("+tableName+")"),DB.query(query)]).then(function(arr){
				var columns = arr[0]//table columns data,
				var data = arr[1]//table contents
				
				//find primary key
				var primaryKeys = [];
				for(var c in columns){
					if(columns[c].pk){
						primaryKeys.push(columns[c].name);
					}
				}
				data.forEach(function(row){
					if(primaryKeys.length === 0){ // if table has no primary key
						var columnValues = underscore.map(columns,function(column){
							return `${column.name}='${row[column.name]}'`;
						});
						row.__metadata = {
							"uri" : uriPrefix+"("+columnValues.join(",")+")",
							"type" : projectName+"."+tableName
						}
					} else if(primaryKeys.length === 1){ // if table has single primary key
						row.__metadata = {
							"uri" : uriPrefix+"("+primaryKeys[0]+"='"+row[primaryKeys[0]]+"')",
							"type" : projectName+"."+tableName
						}
					} else {
						// if multiple PKs in the table
					}
				});
				resolve({d:{results:data}});
			}).catch(function(err){
				reject(err);
			});
		});	
	},
	
	getServiceRoute : function(dbPath){
		return new Promise(function(resolve,reject){
			
			var DB = new database(dbPath);
			
			DB.query("SELECT name,type FROM sqlite_master WHERE (type='table' OR type='view') AND name NOT LIKE 'sqlite%'").then(function(tables){
				for(var i in tables){
					tables[i] = tables[i].name+"Set"
				}
				resolve({
					d:{
						"EntitySets":tables
					}
				});
			}).catch(function(error){
				reject(error);
			})
		});
	},
	
	
	metadata : function(dbPath,projectName){
		
		return new Promise(function(resolve,reject){
			
			var DB = new database(dbPath);
			
			DB.query("SELECT name,type FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite%'").then(function(tables){
				var tableInfos = [];
				var foreignKeys = [];
				tables.forEach(function(table){
					tableInfos.push(DB.query(`PRAGMA table_info(${table.name})`));
					foreignKeys.push(DB.query(`PRAGMA foreign_key_list(${table.name})`));
				})
				
				Promise.all(foreignKeys).then(function(relations){
					Promise.all(tableInfos).then(function(metadata){
						//console.log(relations);
						//all table info read successful
						var schema = [];
						var entityContainer = {
							name:"EntityContainer",
							attrs:{
								"Name":(projectName+".entities").split(".").join("_")
							},
							children:[]
						}
						for(var i in tables){
							var table = {
								name:"EntityType",
								attrs:{
									"Name":tables[i].name
								},
								children:[]
							};
							var hasPrimaryKey = false;
							metadata[i].forEach(function(meta){
								if(meta.pk){
									table.children.push({
										name:"Key",
										children:[{
											name:"PropertyRef",
											attrs:{
												Name:meta.name
											}
										}]
									});
									 hasPrimaryKey = true;
								}
								var column = {
									name:"Property",
									attrs:{
										Name:meta.name,
										Type:datatypeFormatter(meta.type),
										Nullable:(!meta.notnull)
									}
								};
								table.children.push(column);
							});
							// if no primary keys found, then add all columns to Key
							if(!hasPrimaryKey){
								table.children.unshift({
									name:"Key",
									children:underscore.map(metadata[i],function(column){
										return {
											name:"PropertyRef",
											attrs:{
												Name:column.name
											}
										};
									})
								});
							}
							schema.push(table);//table is EntityType
							entityContainer.children.push({
								name:"EntitySet",
								attrs:{
									"Name":tables[i].name+"Set",
									"EntityType":(projectName+"."+tables[i].name)
								}
							})
						}
						underscore.each(relations,function(relation,index){
							
							underscore.each(relation,function(relatesTo){
								
								var association = {
									name:"Association",
									attrs:{
										Name:(relatesTo.table+"Set_to_"+tables[index].name+"Set")
									},
									children:[
										{name:"End", attrs:{Role:relatesTo.table +"Set"+(tables[index].name === relatesTo.table ? "1":""), Type:projectName+"."+relatesTo.table, Multiplicity:"1"}},
										{name:"End", attrs:{Role:tables[index].name+"Set", Type:projectName+"."+tables[index].name, Multiplicity:"*"}},
										{
											name:"ReferentialConstraint",
											children:[
												{
													name:"Principal", 
													attrs:{Role:relatesTo.table +"Set"+(tables[index].name === relatesTo.table ? "1":"")},
													children:[{name:"PropertyRef",attrs:{Name:relatesTo.to}}]
												},
												{name:"Dependent", attrs:{Role:tables[index].name+"Set"},children:[{name:"PropertyRef",attrs:{Name:relatesTo.from}}]}
											]
										}
									]
								}
								schema.push(association);
								
								entityContainer.children.push({
									name:"AssociationSet",
									attrs:{
										"Name":relatesTo.table+"Set_to_"+tables[index].name+"Set",
										"Association":(projectName+"."+relatesTo.table+"Set_to_"+tables[index].name+"Set")
									},
									children:[
										{name:"End", attrs:{Role:tables[index].name+"Set", EntitySet:tables[index].name+"Set"}},
										{name:"End", attrs:{Role:relatesTo.table +"Set"+(tables[index].name === relatesTo.table ? "1":""), EntitySet:relatesTo.table+"Set"}}
									]
								});
								
							});
							
						});
						schema.unshift(entityContainer);

						resolve([{
								"name":"edmx:Edmx",
								"attrs":{
									"xmlns:edmx": "http://schemas.microsoft.com/ado/2007/06/edmx",
									"Version":"1.0"
								},
								"children":[{
									"name":"edmx:DataServices",
									"attrs":{
										"xmlns:m":"http://schemas.microsoft.com/ado/2007/08/dataservices/metadata",
										"m:DataServiceVersion":"1.0"
									},
									"children":[{
											"name":"Schema",
											"attrs":{
												"xmlns":"http://schemas.microsoft.com/ado/2008/09/edm",
												"Namespace":projectName
											},
											"children":schema
										}
									]
								}]
							}]
						);
					}).catch(function(err){
						reject(err);
					});	
				}).catch(function(error){
					reject(error);
				});
				
			}).catch(function(err){
				reject(err);
			});
		});
	}
}