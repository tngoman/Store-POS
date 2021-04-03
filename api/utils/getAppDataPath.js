let path = require('path');
module.exports = function getAppDataPath() {
	switch (process.platform) {
		case "darwin": {
			return path.join(process.env.HOME, "Library", "Application Support", "MYPOS");
		}
		case "win32": {
			return path.join(process.env.APPDATA, "MYPOS");
		}
		case "linux": {
			return path.join(process.env.HOME, "MYPOS");
		}
		default: {
			console.log("Unsupported platform!");
			process.exit(1);
		}
	}
}