.SUFFIXES: .ts

trails-server.js: trails-server.ts
	tsc -t ES5 -m commonjs trails-server.ts
