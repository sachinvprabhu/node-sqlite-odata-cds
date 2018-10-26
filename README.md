# SQLite Core Data Services - OData on NodeJS 
This project is intended to expose OData services using SQLite single file database on NodeJS runtime.

Ideally, an SQLite schema is to be copied to the root folder and OData service should be automatically exposed by the project.
Active development is on.

# Inspiration
This project is inspired by SAP HANA CDS and expects to provide full feature set of core data services on a light database.
As CDS feature of HANA allows developers to build backend services at lightning speed, We aim building CDS on SQLite database in matter of no time.

Active developers are requested to fork or provide feedback

## Implementing basic OData operations
  + Create Entry
  + List Table Entries
  + Get Specific Entry with Primary Key
  + Delete an Entry
  + Update an Entry
  + Filters Implementation for List fetch operation
  + $top and $skip operations

### To be developed
  + Deep Entity CRUD
  + Protection against SQL Injection
  + Building Access level protection

# How to Use
```
# Import module sqlite-odata-cds
$ npm install https://github.com/sachinvprabhu/node-sqlite-odata-cds
```

```javascript
const express = require('express');
const oData = require('sqlite-odata-cds');

const app = express();
app.use(express.json());

//  Connect all our routes to our application
app.use('/ProjectX/SQLite/OData', oData({
	"PROJECT":"Test", //Project Name will be prefixed for all Entity Names
	"DATABASE":"ApplicationDatabase.db" 
	/* An SQLite Database with Relational Tables defined */
}));

// Turn on that server!
app.listen(3000, () => {
  console.log('App listening on port 3000');
});
```

#### Using OData service
```
http://localhost:3000/ProjectX/SQLite/OData/$metadata
```
Sample Output
```
<edmx:Edmx xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" Version="1.0">
    <edmx:DataServices xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" m:DataServiceVersion="1.0">
        <Schema xmlns="http://schemas.microsoft.com/ado/2008/09/edm" Namespace="Test">
            <EntityContainer Name="Test_entities">
                <EntitySet Name="Business_partnersSet" EntityType="Test.Business_partners"/>
            </EntityContainer>
            <EntityType Name="Business_partners">
                <Key>
                    <PropertyRef Name="business_partner_number"/>
                </Key>
                <Property Name="business_partner_number" Type="Edm.Int64" Nullable="false"/>
                <Property Name="name" Type="Edm.String" Nullable="false"/>
                <Property Name="address" Type="Edm.String" Nullable="false"/>
                <Property Name="tax_number" Type="Edm.String" Nullable="true"/>
                <Property Name="email" Type="Edm.String" Nullable="true"/>
                <Property Name="contact_number" Type="Edm.String" Nullable="true"/>
                <Property Name="company" Type="Edm.String" Nullable="true"/>
            </EntityType>
        </Schema>
    </edmx:DataServices>
</edmx:Edmx>
```

You can download a sample Database from [here](http://www.sqlitetutorial.net/sqlite-sample-database/) A good example of music album store.
