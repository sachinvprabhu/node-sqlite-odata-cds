const database = require('./database');
const underscore = require('underscore');
const datatypeFormatter = require("./datatypes");
const filterParser = require("./filterParser");
module.exports = {
	
	createEntry : function(dbPath, projectName, tableName, data, uriPrefix){
		var dataservice = this;
		return new Promise(function(resolve,reject){
			var DB = new database(dbPath);
			
			
			
			Promise.all([DB.query(`PRAGMA table_info(${tableName})`),DB.query(`SELECT * FROM sqlite_sequence WHERE name='${tableName}'`)]).then(function(arr){
				var columns = arr[0];
				
				var aiPresent = arr[1].length;// Auto Increment Present
				
				var columnNames = [];
				var values = [];
				var placeholders=[];
				
				/**
					Pending Optimization
				*/
				if(aiPresent){
					/*
						If auto increment is found, insert all columns other than PK column to the SQL
					*/
					columns.forEach(function(column){
						if(!column.pk && data[column.name] !== null && data[column.name] !== undefined ){
							columnNames.push(column.name);
							values.push(data[column.name]);
							placeholders.push("?");
						}
					});
				} else {
					/*
						Otherwise, insert all columns to the SQL
					*/
					columns.forEach(function(column){
						if( data[column.name] !== null && data[column.name] !== undefined ){
							columnNames.push(column.name);
							values.push(data[column.name]);
							placeholders.push("?");
						}
					});
				}
				
				var query = `INSERT INTO ${tableName}(${columnNames.join(',')}) VALUES(${placeholders.join(',')})`;
				DB.execute(query,values).then(function(response){
					
					var keyColumnNames = underscore.pluck(underscore.filter(columns,"pk"),"name");
					
					var key;
					
					if(aiPresent){ // will have only 1 primary key which will be auto incremented
						key = keyColumnNames[0]+"="+response.lastID;
					} else if( keyColumnNames.length ) { // add key columns & values to URI
						key = underscore.map(keyColumnNames,function(columnName){
							return `${columnName}='${data[columnName]}'`;
						}).join(",");
					} else { //No PK found, every column should be added to key columns
						key = underscore.map(columnNames,function(columnName){
							return `${columnName}='${data[columnName]}'`;
						}).join(",");
					}
					dataservice.getEntry(dbPath, projectName, tableName, key, `${uriPrefix}${tableName}Set(${key})`).then(function(response){
						resolve(response);
					}).catch(function(error){
						reject(error);
					});
					//resolve({d:{results:data}});
					
				}).catch(function(error){
					reject(error);
				});
			}).catch(function(error){
				reject(error);
			});
		});
	},
	
	getEntry : function(dbPath, projectName, tableName, key, uriPrefix){
		return new Promise(function(resolve,reject){
			var DB = new database(dbPath);
			
			Promise.all([
				DB.query(`PRAGMA foreign_key_list(${tableName})`),
				DB.get(`SELECT * FROM ${tableName} WHERE ${key.replace(/,/g," AND ")}`),
				DB.query(`select name from sqlite_master where sql like '%REFERENCES%${tableName}%'`)
			]).then(function(results){
				
				var data = results[1];
				
				if(data){
				
					underscore.each(results[0],function(foreignKey){
						return data[foreignKey.table] = {
							"__deferred":{
								"uri":uriPrefix.replace(/[0-9a-zA-Z_]*Set\(.*\)/,`${foreignKey.table}Set(${foreignKey.to}='${data[foreignKey.from]}')`)
							}
						};
					});
					var referenceTables = underscore.pluck(results[2],"name");

					Promise.all(underscore.map(referenceTables,function(referenceTableName){
						return DB.query(`PRAGMA foreign_key_list(${referenceTableName})`);
					})).then(function(referenceKeyList){
						
						data.__metadata = {
							"uri" : `${uriPrefix}`,
							"type" : `${projectName}.${tableName}`
						};
						referenceKeyList.forEach(function(referenceKey,index){

							referenceKey = underscore.find(referenceKey,{table:tableName});

							data[referenceTables[index]] = {
								"__deferred":{
									"uri":uriPrefix.replace(/[0-9a-zA-Z_]*Set\(.*\)/,`${tableName}Set(${referenceKey.from}='${data[referenceKey.to]}')/${referenceTables[index]}Set`)
								}
							};
						});
						resolve({d:data});
					}).catch(function(error){
						reject(error);
					});
				} else {
					reject(new Error("No Data found"));
				}
			}).catch(function(error){
				reject(error);
			});
		});	
	},
	updateEntry : function(dbPath, projectName, tableName, key, data, uriPrefix){
		var that = this;
		return new Promise(function(resolve,reject){
			var DB = new database(dbPath);
			
			if( key && key.length > 2 ){ // key should not come as '()' // need to check if all key fields are present in key string
				DB.query(`PRAGMA table_info(${tableName})`).then(function(columns){
					var columnNames = [];
					var values = [];
					try {
						columns.forEach(function(column){
							//all PKs should be in key string
							if(column.pk){
								if( key.indexOf(column.name+"=") === -1 ){
									throw new Error(column.name+" Key field is missing in URI");
								}
							} else 
							//primary keys cannot be updated
							if(data[column.name] !== null && data[column.name] !== undefined ){
								columnNames.push(column.name+"=?");
								values.push(data[column.name]);
							}
						});
						if(!columnNames.length){
							throw new Error("No fields to update");
						}
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
					} catch (error){
						reject(error);
					}
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
			var query = `DELETE FROM ${tableName} WHERE ${key.replace(/,/g," AND ")}`;
			DB.execute(query).then(function(statement){
				resolve();
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
			
			
			Promise.all([DB.query(`PRAGMA table_info(${tableName})`),DB.query(`PRAGMA foreign_key_list(${tableName})`),DB.query(query),DB.query(`select name from sqlite_master where sql like '%REFERENCES%${tableName}%'`)]).then(function(arr){
				var columns = arr[0];		// table columns data,
				var foreignKeys = arr[1];	// this table refering other tables columns
				var tableOutput = arr[2];	// sql output
				var relatedTables = underscore.pluck(arr[3],"name");	// other tables refering this tables
				
				Promise.all(underscore.map(relatedTables,function(relatedTableName){
					return DB.query(`PRAGMA foreign_key_list(${relatedTableName})`);
				})).then(function(relatedTableColumns){
					
					//find primary key and assign key list
					var primaryKeys = underscore.filter(columns,"pk");

					if(primaryKeys.length === 0){ // if table has no primary key, add all columns to the key list
						underscore.each(tableOutput,function(row){
							row.__metadata = {
								"uri" : uriPrefix+"("+underscore.map(columns,function(column){
									return `${column.name}='${row[column.name]}'`;
								})+")", // creating key value pairs
								"type" : projectName+"."+tableName
							};
						});
					} else { // if table has one or more PKs
						underscore.each(tableOutput,function(row){
							row.__metadata = {
								"uri" : uriPrefix+"("+ underscore.map(underscore.pluck(primaryKeys,"name"),function(columnName){
									return `${columnName}='${row[columnName]}'`;
								}).join(",") +")",
								"type" : projectName+"."+tableName
							};
						});
					}
					
					tableOutput.forEach(function(row){
						/*
							Pending to add references in other tables for this table - This completes the deep entity extraction
						*/
						
						foreignKeys.forEach(function(foreignKey){
							row[foreignKey.table] = {
								"__deferred":{
									"uri":uriPrefix.replace(/[0-9a-zA-Z_]*Set/,"")+`${foreignKey.table}Set(${foreignKey.to}='${row[foreignKey.from]}')`
								}
							}
						});
						relatedTables.forEach(function(relatedTableName, relatedTableIndex){
							
							var relationColumn = underscore.find(relatedTableColumns[relatedTableIndex],{table:tableName});
							
							row[relatedTableName] = {
								"__deferred":{
									"uri":uriPrefix+`(${relationColumn.from}='${row[relationColumn.to]}')`+"/"+relatedTableName+"Set"
								}
							};
						});
					});
					resolve({d:{results:tableOutput}});
				}).catch(function(error){
					reject(error);
				});
			}).catch(function(err){
				reject(err);
			});
		});	
	},
	getCount : function(dbPath, projectName, tableName, uriPrefix, filters){
		
		return new Promise(function(resolve,reject){
		
			var DB = new database(dbPath);
			
			var filterString = "";
			if(filters){
				//convert filters to where clause here
				filterString = filterParser(filters);
			}
			
			var query = "SELECT count(*) FROM "+tableName+(filterString?(" WHERE "+filterString):"");
			
			DB.get(query).then(function(values){
				resolve(values["count(*)"]);
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
				var backwordReferences = [];
				tables.forEach(function(table){
					tableInfos.push(DB.query(`PRAGMA table_info(${table.name})`));
					foreignKeys.push(DB.query(`PRAGMA foreign_key_list(${table.name})`));
					backwordReferences.push(DB.query(`select name from sqlite_master where sql like '%REFERENCES%${table.name}%'`));
				});
				Promise.all(backwordReferences).then(function(relatedTables){
					Promise.all(foreignKeys).then(function(relationColumns){
						Promise.all(tableInfos).then(function(tableColumns){
							
							var entityTypes = underscore.map(tables,function(table,index){
								
								return {
									name:"EntityType",
									attrs:{
										"Name":table.name
									},
									children:[{
										name:"Key",
										children:underscore.map(underscore.filter(tableColumns[index],"pk")||tableColumns[index],function(keyColumn){ // adding primary key fields
											return {
												name:"PropertyRef",
												attrs:{
													Name:keyColumn.name
												}
											};
										})
									}].concat( underscore.map(tableColumns[index],function(column){ // adding rest of all fields
										return {
											name:"Property",
											attrs:{
												Name:column.name,
												Type:datatypeFormatter(column.type),
												Nullable:(!column.notnull)
											}
										};
									}))
								};
							});
							
							
							
							
							var associations = underscore.reduce(relatedTables,function(memo,referringTables,index){
									
								//each referencingTables is an array of table names [{name:'table_name'}]

								return memo.concat(underscore.map(referringTables,function(table){
									
									var relatesTo = tables[index];
									var reference = underscore.find( relationColumns[underscore.findIndex(tables,table)], {table:relatesTo.name});
									
									return {
										fromTable:table.name,
										toTable:relatesTo.name,
										association:{
											name:"Association",
											attrs:{
												Name:`FK_${table.name}Set_${relatesTo.name}Set`
											},
											children: [{
												name: "End",
												attrs: {
													Role: relatesTo.name + "Set" + (table.name === relatesTo.name ? "1" : ""),
													Type: projectName + "." + relatesTo.name,
													Multiplicity: "1"
												}
											},
											{
												name: "End",
												attrs: {
													Role: table.name + "Set",
													Type: projectName + "." + table.name,
													Multiplicity: "*"
												}
											},{
												name: "ReferentialConstraint",
												children: [{
														name: "Principal",
														attrs: {
															Role: relatesTo.name + "Set" + (table.name === relatesTo.name ? "1" : ""),
														},
														children: [{
															name: "PropertyRef",
															attrs: {
																Name: reference.to
															}
														}]
													},
													{
														name: "Dependent",
														attrs: {
															Role: table.name + "Set",
														},
														children: [{
															name: "PropertyRef",
															attrs: {
																Name: reference.from
															}
														}]
													}
												]
											}]
										}
									};
								}))
							},[]);
							
							
							associations.forEach(function(association){
								var entityType = underscore.find(entityTypes,function(entityType){
									return association.fromTable === entityType.attrs.Name;
								});
								if(entityType){
									entityType.children.push({
										name:"NavigationProperty",
										attrs:{
											Name:association.toTable,
											FromRole:`${association.fromTable}Set`,
											ToRole:`${association.toTable}Set`,
											Relationship:`${projectName}.${association.association.attrs.Name}`
										}
									})
								}
								entityType = underscore.find(entityTypes,function(entityType){
									return association.toTable === entityType.attrs.Name;
								});
								if(entityType){
									entityType.children.push({
										name:"NavigationProperty",
										attrs:{
											Name:association.fromTable,
											FromRole:`${association.toTable}Set`,
											ToRole:`${association.fromTable}Set`,
											Relationship:`${projectName}.${association.association.attrs.Name}`
										}
									})
								}
							});
							
							entityTypes = entityTypes.concat(underscore.pluck(associations,"association"));
							
							entityTypes = entityTypes.concat([{
								name:"EntityContainer",
								attrs:{
									"Name":(projectName+"_entities"),
									"m:IsDefaultEntityContainer":"true"
								},
								children:underscore.map(tables,function(table,index){
									return {
										name:"EntitySet",
										attrs:{
											"Name":table.name+"Set",
											"EntityType":(projectName+"."+table.name)
										}
									};
								}).concat(underscore.map(associations,function(association){
									return {
										name:"AssociationSet",
										attrs:{
											"Name":association.association.attrs.Name,
											"Association":(projectName+"."+association.association.attrs.Name)
										},
										children:[
											{name:"End", attrs:{Role:association.fromTable+"Set", EntitySet:association.fromTable+"Set"}},
											{name:"End", attrs:{Role:association.toTable +"Set"+(association.toTable === association.fromTable ? "1":""), EntitySet:association.toTable+"Set"}}
										]
									};
								}))
							}]);
							
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
											"children":entityTypes
										}
									]
								}]
							}]);
						}).catch(function(err){
							reject(err);
						});	
					}).catch(function(error){
						reject(error);
					});
				}).catch(function(err){
					reject(err);
				});
					
					
					
					
					
					
				}).catch(function(){
					
				})
				
		});
	}
}