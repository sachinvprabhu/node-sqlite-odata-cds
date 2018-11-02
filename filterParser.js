module.exports = function(query){
	
	var substringQuery = query.match(/substringof\(.*\)/);//substringof(abc,Name) something like this
	if(substringQuery){
		
		substringQuery = query.match(/substringof\(.*\)/).toString();
		
		var column = substringQuery.match(/,[_a-zA-Z0-9]+\)/).toString();
		column = column.substr(1,column.length-2);
		
		var value = substringQuery.match(/\(.+\,/).toString();
		value = value.substr(1,value.length-2);
		value = `%${value}%`;
		
		query = query.replace(substringQuery,`${column} LIKE '${value}'`);
	}
	
	query = query.replace(/ gt /g,">")
	.replace(/ ge /g,">=")
	.replace(/ lt /g,"<")
	.replace(/ le /g,"<=")
	.replace(/ eq /g,"=")
	
	
	return query;
}
