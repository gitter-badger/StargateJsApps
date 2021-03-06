// global variable used by old stargate client
// @deprecated since v0.1.2
window.pubKey = '';
// @deprecated since v0.1.2
window.forge = '';


var initOfflinePromise;

/**
 * Initialize offline will be resolved at the deviceready event or rejected after a timeout
 * @param {object} [options={}] - an object with offline initialization options
 * @param [options.hideSplashScreen=true] - a boolean indicating to hide or not the splash screen
 * @returns {Promise<boolean>}
 * */
stargatePublic.initializeOffline = function(options){

    if(initOfflinePromise) {
        return initOfflinePromise;
    }
    
    // - start set default options -
    if (typeof options !== "object") {
        options = {};
    }
    if (! options.hasOwnProperty("hideSplashScreen")) {
        options.hideSplashScreen = true;
    }
    // -- end set default options --
    
    isStargateInitialized = true;
    initOfflinePromise = new Promise(function (initOfflineResolve) {
        document.addEventListener("deviceready", function deviceReadyOffline() {

            // device ready received so i'm sure to be hybrid
            setIsHybrid();
            
            // get device information
            initDevice();
            
            // get connection information
            initializeConnectionStatus();

            // request all asyncronous initialization to complete
            Promise.all([
                // include here all needed asyncronous initializazion
                cordova.getAppVersion.getVersionNumber(),
                getManifest()
            ])
            .then(function(results) {
                // save async initialization result

                appVersion = results[0];
                
                if (typeof results[1] !== 'object') {
                    results[1] = JSON.parse(results[1]);
                }

                baseUrl = results[1].start_url;

                stargateConf = results[1].stargateConf;
                
                if (options.hideSplashScreen) {
                    navigator.splashscreen.hide();
                    setBusy(false);                    
                }

                // initialize finished
                isStargateOpen = true;

                log("Stargate.initializeOffline() done");

                initOfflineResolve(true);

            })
            .catch(function (error) {
                err("initializeOffline() error: "+error);
            });

            
        });
    });
    return initOfflinePromise;
};


/**
 * Stargate application configuration getters namespace
 */
stargatePublic.conf = {};

/**
 * Get url of webapp starting page when hybrid 
 * @returns {String}
 */
stargatePublic.conf.getWebappStartUrl = function() {
    return stargateConf.webapp_start_url;
};

/**
*
* initialize(configurations, callback)
* @deprecated initialize(configurations, pubKey, forge, callback)
*/
stargatePublic.initialize = function(configurations, pubKeyPar, forgePar, callback) {

    // parameters checking to support both interfaces:
    //    initialize(configurations, callback)
    //    initialize(configurations, pubKey, forge, callback)
    if (typeof pubKeyPar === 'function' &&
        typeof forgePar === 'undefined' &&
        typeof callback === 'undefined') {
        // second parameter is the callback
        callback = pubKeyPar;
    }

    // check callback type is function
    // if not return a failing promise 
    if (typeof callback !== 'function') {
        err("Stargate.initialize() callback is not a function!");

        var errDefer = Q.defer();
        setTimeout(function(){
            // fail the promise
            errDefer.reject(new Error("Stargate.initialize() callback is not a function!"));
        }, 1);
        return errDefer.promise;
    }

    isStargateRunningInsideHybrid = isHybridEnvironment();

    // if i'm already initialized just:
    //  * execute the callback
    //  * return a resolving promise
    if (isStargateInitialized) {
        err("Stargate.initialize() already called, executing callback.");
        
        if(callback){callback(isStargateRunningInsideHybrid);}

        var alreadyRunningDefer = Q.defer();
        setTimeout(function(){
            // resolve the promise
            alreadyRunningDefer.resolve(isStargateRunningInsideHybrid);
        }, 1);
        return alreadyRunningDefer.promise;
    }

    isStargateInitialized = true;


    if(configurations.country){
        country = configurations.country;
    }
    
    if(configurations.hybrid_conf){
        if (typeof configurations.hybrid_conf === 'object') {
            hybrid_conf = configurations.hybrid_conf;
        } else {
            hybrid_conf = JSON.parse(decodeURIComponent(configurations.hybrid_conf));
        }
    }

    // if not running inside hybrid save the configuration then:
    //  * call the callback and return a resolving promise
    if (!isStargateRunningInsideHybrid) {

        log("version "+stargatePackageVersion+" running outside hybrid; "+
            "loaded from server version: v"+stargateVersion);

        callback(isStargateRunningInsideHybrid);

        var notHybridDefer = Q.defer();
        setTimeout(function(){
            // resolve the promise
            notHybridDefer.resolve(isStargateRunningInsideHybrid);
        }, 1);
        return notHybridDefer.promise;
    }

    log("initialize() starting up, configuration: ",hybrid_conf);

    initializeCallback = callback;
    initializeDeferred = Q.defer();

    // finish the initialization of cordova plugin when deviceReady is received
    document.addEventListener('deviceready', onDeviceReady, false);
    
    return initializeDeferred.promise;
};

stargatePublic.isInitialized = function() {
    return isStargateInitialized;
};

stargatePublic.isOpen = function() {
    return isStargateOpen;
};

stargatePublic.isHybrid = function() {
    return isHybridEnvironment();
};

stargatePublic.openUrl = function(url) {

	if (!isStargateInitialized) {
		return err("Stargate not initialized, call Stargate.initialize first!");
    }
    // FIXME: check that inappbrowser plugin is installed otherwise retunr error

    window.open(url, "_system");
};

stargatePublic.googleLogin = function(callbackSuccess, callbackError) {

	if (!isStargateInitialized) {
		return callbackError("Stargate not initialized, call Stargate.initialize first!");
    }

    // FIXME: implement it; get code from old stargate

    err("unimplemented");
    callbackError("unimplemented");
};

var connectionStatus = {
    type: "unknown",
    networkState: "unknown"
};

function updateConnectionStatus(theEvent){
    connectionStatus.type = theEvent.type;
    connectionStatus.networkState = navigator.connection.type;
}

window.addEventListener("online", updateConnectionStatus, false);
window.addEventListener("offline", updateConnectionStatus, false);

function initializeConnectionStatus() {
    connectionStatus.networkState = navigator.connection.type;
    
    if (navigator.connection.type === "none") {
        connectionStatus.type = "offline";
    } else {
        connectionStatus.type = "online";        
    }
}

/**
 * checkConnection function returns the updated state of the client connection
 * @param {Function} [callbackSuccess=function(){}] - callback success filled with: {type:"online|offline",networkState:"wifi|3g|4g|none"}
 * @param {Function} [callbackError=function(){}] - called if stargate is not initialize or cordova plugin missing
 * @returns {Object|boolean} connection info {type:"online|offline",networkState:"wifi|3g|4g|none"}
 * */
stargatePublic.checkConnection = function() {

    var callbackSuccess = arguments.length <= 0 || arguments[0] === undefined ? function(){} : arguments[0];
    var callbackError = arguments.length <= 1 || arguments[1] === undefined ? function(){} : arguments[1];

	if (!isStargateInitialized) {
		callbackError("Stargate not initialized, call Stargate.initialize first!");
        return false;
    }

    if(typeof navigator.connection.getInfo !== "function"){
        callbackError("Missing cordova plugin");
        console.warn("Cordova Network Information module missing");
        return false;
    }

    callbackSuccess(connectionStatus);
    return connectionStatus;
};
stargatePublic.getDeviceID = function(callbackSuccess, callbackError) {

	if (!isStargateInitialized) {
		return callbackError("Stargate not initialized, call Stargate.initialize first!");
    }

    // FIXME: check that device plugin is installed
    // FIXME: integrate with other stargate device handling method

    var deviceID = runningDevice.uuid;
    callbackSuccess({'deviceID': deviceID});
};

stargatePublic.setStatusbarVisibility = function(visibility, callbackSuccess, callbackError) {

    if (!isStargateInitialized) {
        return callbackError("Stargate not initialized, call Stargate.initialize first!");
    }

    if (typeof window.StatusBar === "undefined") {
        // missing cordova plugin
        err("[StatusBar] missing cordova plugin");
        return callbackError("missing cordova plugin");
    }

    if (visibility) {
        window.StatusBar.show();
        return callbackSuccess("statusbar shown");
    }

    window.StatusBar.hide();
    return callbackSuccess("statusbar hided");
};


stargatePublic.getVersion = function() {
    return stargatePackageVersion;
};

/**
 * This is a decorator:
 * before calling a module's function I check that stargate is initialized for each module
 *
 * @param {Object} context - context is the "this" of the method. usually the parent
 * @param {Function} fn - fn is the function to decorate with isStargateInitialized
 * @returns {Function} the function actually called
 * */
/*function decorateWithInitialized(context, fn){
    return function(){
        if(isStargateInitialized){
            return fn.apply(context, arguments);
        }
        console.warn("[Stargate.js] - WARN! not initialize");
    };
}

// decorate the game modules: do it for all modules?
for(var fn in _modules.game){
    if(typeof _modules.game[fn] === "function"){
        _modules.game[fn] = decorateWithInitialized(_modules.game, _modules.game[fn]);
    }
}*/

/**  
 *
 *  stargatePublic.inApp* -> iap.js
 *
 */

stargatePublic.ad = new AdStargate();