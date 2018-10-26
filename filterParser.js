module.exports = function(query){
	return query.replace(/gt/g,">")
	.replace(/ge/g,">=")
	.replace(/lt/g,"<")
	.replace(/le/g,"<=")
	.replace(/eq/g,"=");
}
