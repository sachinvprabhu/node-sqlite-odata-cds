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
		case "DATETIME":
			return "Edm.DateTime";
		default : return "Edm.String";
	}
}
