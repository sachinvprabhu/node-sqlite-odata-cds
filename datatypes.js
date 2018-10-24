module.exports = function(type){
	switch(type){
		case "INTEGER":
			return "Edm.Int64";
		case "TEXT":
			return "Edm.String";
		case "REAL":
			return "Edm.Single";
		case "NUMERIC":
			return "Edm.Double";
		default : return "Edm.String";
	}
}