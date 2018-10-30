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
									"uri":uriPrefix.replace(/[0-9a-zA-Z_]*Set/,"")+`${relatedTableName}Set?$filter=${relationColumn.from} eq '${row[relationColumn.to]}'`
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
							})
							
							entityTypes = entityTypes.concat(underscore.pluck(associations,"association"));
							
							entityTypes = entityTypes.concat([{
								name:"EntityContainer",
								attrs:{
									"Name":(projectName+"_entities")
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
							}])
							
							
							
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
								}]
							);
							
							
							/*
							//console.log(relations);
							//all table info read successful
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
								
								
								
								
								
								
								//debugger;
								
								var relatedTables = underscore.find()
								
								relations[i].forEach(function(relation){
									console.log(tables[i].name, relation.from, relation.table, relation.to )
									
									table.children.push({
										name:"NavigationProperty",
										attrs:{
											Name:relation.table,
											FromRole:tables[i].name+"Set",
											ToRole:relation.table+"Set",
											Relationship:(projectName+"."+relation.table+"Set_to_"+tables[i].name+"Set")
										}
									});
									
									
								})
								
								/*
								
								aTables.forEach(function(referencingTables,index){
									referencingTables.forEach(function(referencingTable){

										console.log(
											tables[index].name,
											"uses",
											referencingTable.name
										);
									});
								});
								
								
								
								
								
								/*

								relations[i].forEach(function(navigationProperty){
									table.children.push({
										name:"NavigationProperty",
										attrs:{
											Name:navigationProperty.table,
											FromRole:tables[i].name+"Set",
											ToRole:navigationProperty.table+"Set",
											Relationship:(projectName+"."+navigationProperty.table+"Set_to_"+tables[i].name+"Set")
										}
									});
								});

								
								* /
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
							
							
							
							
							*/
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