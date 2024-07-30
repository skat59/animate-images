var pkg = require("../package.json");

module.exports =
` ${pkg.name} ${pkg.version}
 ${pkg.repository.url}
         
 Copyright (c) 2020-present ${pkg.author}

 Author ${pkg.author}

 Author ProjectSoft

 Released under the ${pkg.license} license`;
