var fs = require('fs');
var path = require('path');
var storage = require('node-persist');
    storage.initSync();
var crypto = require('crypto');
var request = require("request");
var _ = require("underscore");

// Accessory Code is always 03145154
var _veraIP = "10.10.0.6";

console.log("Starting Vera HomeKit Bridge...");
getVeraDevices(_veraIP);

function getVeraDevices(veraIP) {
	var url = "http://" + veraIP + ":3480/data_request?id=lu_sdata"

	request({ url: url, json: true },
		function (error, response, body) {
			processDevices(body.devices);
			processScenes(body.scenes);
		}
	);
}

function processScenes(scenes) {
	scenes.forEach(function(scene) {
    if (scene.name.indexOf(" - Off") == -1){
			//offScene = scenes.forEach(function(offScene) {
        //if (offScene.name.indexOf(" - Off") > -1 && offScene.name.indexOf(scene.name.replace(" - On", " - Off")) > -1) {
          //return offScene;
        //}
      //});
      offScene = _.find(scenes, function(offScene){ return offScene.name == scene.name.replace(" - On", " - Off")});
      createScene(scene, offScene);
    }
	});
}

function processDevices(devices) {
	devices.forEach(function(device) {
		switch (device.category) {
			case 2: // CATEGORY #2 - Dimmable Light:
        createDimmableLight(device);
				break;

			case 3: // CATEGORY #3 - Switch
				createLight(device);
				break;

			case 7: // CATEGORY #7 - Door lock
        if (device.name == "Garage Door") {
          createGarageDoor(device);
        } else {
          createLock(device);
        }
				break;
		}
	});
}

function createScene(scene, offScene) {
	var Scene = require("./accessories/Scene.js");
    var accessory = new Scene.initializeWithDevice(_veraIP, scene, offScene);
    createHomeKitAccessory(accessory);
}

function createDimmableLight(device) {
	var DimmableLight = require("./accessories/DimmableLight.js");
    var accessory = new DimmableLight.initializeWithDevice(_veraIP, device);
    createHomeKitAccessory(accessory);
}

function createLight(device) {
	var Light = require("./accessories/Light.js");
    var accessory = new Light.initializeWithDevice(_veraIP, device);
    createHomeKitAccessory(accessory);
}

function createLock(device) {
	var Lock = require("./accessories/Lock.js");
    var accessory = new Lock.initializeWithDevice(_veraIP, device);
    createHomeKitAccessory(accessory);
}

function createGarageDoor(device) {
	var GarageDoor = require("./accessories/GarageDoor.js");
    var accessory = new GarageDoor.initializeWithDevice(_veraIP, device);
    createHomeKitAccessory(accessory);
}

// Pull in required HAP-NodeJS stuff
var accessory_Factor = new require("./lib/HAP-NodeJS/Accessory.js");
var accessoryController_Factor = new require("./lib/HAP-NodeJS/AccessoryController.js");
var service_Factor = new require("./lib/HAP-NodeJS/Service.js");
var characteristic_Factor = new require("./lib/HAP-NodeJS/Characteristic.js");

// Each accessory has its own little server. We'll need to allocate some ports for these servers
//var nextPort = 51826;
var nextPort = 50000;
var nextServer = 0;
var accessoryServers = [];
var accessoryControllers = [];
var usernames = {};

function createHomeKitAccessory(accessory) {

	var name = accessory.name;
	var services = accessory.getServices();

	console.log("Create accessory: " + accessory.name);
	//createHAPServer(name, services)
	//process.exit(1);

	var accessoryController = new accessoryController_Factor.AccessoryController();

	// Add the services to the accessory
    for (var j = 0; j < services.length; j++) {
        var service = new service_Factor.Service(services[j].sType);
        for (var k = 0; k < services[j].characteristics.length; k++) {
            var options = {
                type: services[j].characteristics[k].cType,
                perms: services[j].characteristics[k].perms,
                format: services[j].characteristics[k].format,
                initialValue: services[j].characteristics[k].initialValue,
                supportEvents: services[j].characteristics[k].supportEvents,
                supportBonjour: services[j].characteristics[k].supportBonjour,
                manfDescription: services[j].characteristics[k].manfDescription,
                designedMaxLength: services[j].characteristics[k].designedMaxLength,
                designedMinValue: services[j].characteristics[k].designedMinValue,
                designedMaxValue: services[j].characteristics[k].designedMaxValue,
                designedMinStep: services[j].characteristics[k].designedMinStep,
                unit: services[j].characteristics[k].unit
            };
            var characteristic = new characteristic_Factor.Characteristic(options, services[j].characteristics[k].onUpdate);
            service.addCharacteristic(characteristic);
        }
        accessoryController.addService(service);
    }

    // create a unique "username" for this accessory based on the default display name
    var username = createUsername(name);
    if (usernames[username]) {
        console.log("Cannot create another accessory with the same name '" + name + "'. The 'name' property must be unique for each accessory.");
        return;
    }

    // remember that we used this name already
    usernames[username] = name;

    // increment ports for each accessory
    nextPort = nextPort + (nextServer+5);

    // hardcode the PIN to something random (same PIN as HAP-NodeJS sample accessories)
    var pincode = "031-45-154";

    var accessory = new accessory_Factor.Accessory(name, username, storage, parseInt(nextPort), pincode, accessoryController);
    accessoryServers[nextServer] = accessory;
    accessoryControllers[nextServer] = accessoryController;
    accessory.publishAccessory();

    nextServer++;
}
//
// Creates a unique "username" for HomeKit from a hash of the given string
function createUsername(str) {

    // Hash str into something like "098F6BCD4621D373CADE4E832627B4F6"
    var hash = crypto.createHash('md5').update(str).digest("hex").toUpperCase();

    // Turn it into a MAC-address-looking "username" for HomeKit
    return hash[0] + hash[1] + ":" +
           hash[2] + hash[3] + ":" +
           hash[4] + hash[5] + ":" +
           hash[6] + hash[7] + ":" +
           hash[8] + hash[9] + ":" +
           hash[10] + hash[11];
}