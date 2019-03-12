module.exports = function(query){
	query = query.replace(" eq null ", " is NULL ").replace(" ne null ", " is NOT NULL ");
	var substringQuery = query.match(/substringof\(.*\)/);//substringof(abc,Name) something like this
	if(substringQuery){
		
		substringQuery = query.match(/substringof\(.*\)/).toString();
		
		var column = substringQuery.match(/,[_a-zA-Z0-9]+\)/).toString();
		column = column.substr(1,column.length-2);
		
		var value = substringQuery.match(/\(.+\,/).toString();
		value = value.substr(1,value.length-2);
		value = value.replace(/\'/g,"");
		value = `%${value}%`;
		
		query = query.replace(substringQuery,`${column} LIKE '${value}'`);
	}
	
	var numbers = query.match(/ [0-9\.]+[lf]/g);
	
	if(numbers){
		numbers.forEach(function(numberString){
			query = query.replace(numberString,numberString.substr(0,numberString.length-1));
		})
	}
	
	query = query.replace(/ gt /g,">")
	.replace(/ ge /g,">=")
	.replace(/ lt /g,"<")
	.replace(/ le /g,"<=")
	.replace(/ eq /g,"=")
	.replace(/ ne /g,"<>")
	
	
	return query;
}
