"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SessionProvider = exports.logout = exports.login = exports.silentAuth = exports.handleLogin = exports.handleLogout = exports.getAccessCookie = exports.getAccessToken = exports.getAuthRedirect = exports.setAuthRedirect = void 0;

var _react = _interopRequireDefault(require("react"));

var _propTypes = _interopRequireDefault(require("prop-types"));

var _reactRedux = require("react-redux");

var _redux = require("redux");

var _jsCookie = _interopRequireDefault(require("js-cookie"));

var _clientOauth = _interopRequireDefault(require("client-oauth2"));

var _crypto = _interopRequireDefault(require("crypto"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var isBrowser = typeof window !== "undefined";
var authAccessCookieKey = "wpAuthAccess";
var algorithm = "aes-256-cbc"; // @TODO figure out dotenv.

var key = process.env.WPAUTH_CRYPTO_KEY;
var iv = process.env.WPAUTH_CRYPTO_IV;
var hasLocalStorage = typeof localStorage !== "undefined"; // Encrypt a string of text.

function encrypt(text) {
  var cipher = _crypto["default"].createCipheriv(algorithm, Buffer.from(key), iv);

  var encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher["final"]()]);
  return encrypted.toString("hex");
} // Decrypt a string of text.


function decrypt(text) {
  var encryptedText = Buffer.from(text, "hex");

  var decipher = _crypto["default"].createDecipheriv(algorithm, Buffer.from(key), iv);

  var decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher["final"]()]);
  return decrypted.toString();
} // Generate a random string.


function randomString(length) {
  if (!isBrowser) {
    return null;
  }

  var bytes = new Uint8Array(length);
  var result = [];
  var charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._~";
  var cryptoObj = window.crypto || window.msCrypto;

  if (!cryptoObj) {
    return null;
  }

  var random = cryptoObj.getRandomValues(bytes);

  for (var a = 0; a < random.length; a++) {
    result.push(charset[random[a] % charset.length]);
  }

  return result.join("");
} // Setup our auth client.


var auth = isBrowser ? new _clientOauth["default"]({
  clientId: process.env.WPAUTH_CLIENTID,
  clientSecret: process.env.WPAUTH_CLIENTSECRET,
  accessTokenUri: process.env.WPAUTH_DOMAIN + "/token",
  authorizationUri: process.env.WPAUTH_DOMAIN + "/authorize",
  redirectUri: process.env.WPAUTH_CALLBACK,
  nonce: randomString(32) //scopes: ["profile", "email", "openid"], @TODO dont need?
  //state: randomString(32) @TODO add? WordPress doesn't return state so errors out

}) : {};
/*
 * @TODO check on token expiration.

 * When does authorization expire?
 * By default, every 48 hours.
 * The duration is in milliseconds.
 */
//const authExpiration = 172800000

/*if (Date.now() - token.date > authExpiration) {
	this.removeToken()
	return false
}*/
// Key we use to store the redirect path for after authentication.

var loginRedirectKey = "wpAuthRedirect";

var deleteAuthRedirect = function deleteAuthRedirect() {
  hasLocalStorage && localStorage.removeItem(loginRedirectKey);
};

var setAuthRedirect = function setAuthRedirect(redirect) {
  hasLocalStorage && localStorage.setItem(loginRedirectKey, redirect);
};

exports.setAuthRedirect = setAuthRedirect;

var getAuthRedirect = function getAuthRedirect(deleteRedirect) {
  var redirect = hasLocalStorage && localStorage.getItem(loginRedirectKey);

  if (true === deleteRedirect) {
    deleteAuthRedirect();
  }

  return redirect;
}; // Returns access token if valid, false otherwise.


exports.getAuthRedirect = getAuthRedirect;

var getAccessToken = function getAccessToken() {
  if (!isBrowser) {
    return false;
  }

  var access = getAccessCookie();

  if (undefined === access || !access) {
    deleteAccessCookie();
    return false;
  }

  return access;
}; // Get our access cookie. Pass true to decrypt.


exports.getAccessToken = getAccessToken;

var getAccessCookie = function getAccessCookie() {
  var value = _jsCookie["default"].get(authAccessCookieKey);

  if (undefined === value || !value) {
    return value;
  }

  return decrypt(value);
}; // Store access token in cookie.


exports.getAccessCookie = getAccessCookie;

var setAccessCookie = function setAccessCookie(token, expires) {
  var secure = true; // For local builds.

  if (isBrowser && "http://localhost:9000" === window.location.origin) {
    secure = false;
  }

  var encrypedToken = encrypt(token);

  _jsCookie["default"].set(authAccessCookieKey, encrypedToken, {
    expires: expires,
    //domain: @TODO?
    secure: secure,
    sameSite: "strict"
  });
}; // Delete access token cookie.


var deleteAccessCookie = function deleteAccessCookie() {
  return new Promise(function (resolve) {
    _jsCookie["default"].remove(authAccessCookieKey);

    resolve();
  });
}; // Delete session data.


var deleteSession = function deleteSession() {
  return deleteAccessCookie();
}; // Store session data.


var setSession = function setSession(authResult, setUser) {
  return new Promise(function (resolve, reject) {
    if (authResult === undefined) {
      reject();
    }

    if (!authResult.user || !authResult.resource) {
      reject();
    }

    setAccessCookie(authResult.user.accessToken, authResult.user.expires); // Store user info.

    setUser(authResult.resource);
    resolve();
  });
};

var handleLogout = function handleLogout() {
  return deleteSession();
};

exports.handleLogout = handleLogout;

var handleLogin = function handleLogin(_ref) {
  var user = _ref.user,
      setUser = _ref.setUser;
  return new Promise(function (resolve) {
    if (user.isLoggedIn()) {
      return resolve();
    }

    return validateToken({
      setUser: setUser
    });
  });
};

exports.handleLogin = handleLogin;

var validateToken = function validateToken(_ref2) {
  var setUser = _ref2.setUser;
  return auth.code.getToken(window.location.href).then(function (user) {
    var request = user.sign({
      method: "get",
      url: process.env.WPAUTH_DOMAIN + "/resource"
    });
    return fetch(request.url, request).then(function (response) {
      return response.json();
    }).then(function (response) {
      return {
        user: user,
        resource: response
      };
    });
  }).then(function (response) {
    return setSession(response, setUser);
  })["catch"](function () {
    // @TODO handle error?
    return deleteSession();
  });
};

var finishLoading = function finishLoading(dispatch) {
  return dispatch({
    type: "finishLoading"
  });
}; // Don't silent auth for these routes.


var noAauthRoutes = ["/callback/", "/logout/"]; // Handles authentication "silently" in the background on app load.

var silentAuth = function silentAuth(store) {
  if (!isBrowser) {
    return finishLoading(store.dispatch);
  }

  if (noAauthRoutes.includes(window.location.pathname)) {
    return finishLoading(store.dispatch);
  } // If authenticated, returns the access key.


  var access = getAccessToken();

  if (!access) {
    return finishLoading(store.dispatch);
  }

  var userToken = auth.createToken(access, "", "code");
  var request = userToken.sign({
    method: "get",
    url: process.env.WPAUTH_DOMAIN + "/resource"
  });
  fetch(request.url, request).then(function (response) {
    return response.json();
  }).then(function (response) {
    if (response.error) {
      throw response.error_description;
    }

    store.dispatch({
      type: "setUser",
      payload: {
        user: response
      }
    });
  })["catch"](function () {
    // @TODO handle error?
    return deleteSession();
  })["finally"](function () {
    return finishLoading(store.dispatch);
  });
}; // Redirect to SSO login page.


exports.silentAuth = silentAuth;

var login = function login() {
  if (!isBrowser) {
    return;
  } // Delay redirect a little so loading page doesn't flash.


  setTimeout(function () {
    window.location = auth.code.getUri();
  }, 500);
}; // Handles logout by redirecting to SSO.


exports.login = login;

var logout = function logout(access) {
  var user = auth.createToken(access, "", "token", {
    expires: new Date()
  });
  var request = user.sign({
    method: "get",
    url: process.env.WPAUTH_DOMAIN + "/logout"
  });
  window.location = request.url + "&redirect_uri=" + encodeURIComponent(process.env.WPAUTH_CALLBACK);
};

exports.logout = logout;

var wpcMember = /*#__PURE__*/function () {
  function wpcMember(props) {
    _classCallCheck(this, wpcMember);

    this.populate(props);
  }

  _createClass(wpcMember, [{
    key: "populate",
    value: function populate(props) {
      var userID = props !== undefined && props.ID ? parseInt(props.ID) : 0;

      if (userID > 0) {
        this.authenticated = true;
        this.data = props;
      } else {
        this.authenticated = false;
        this.data = {};
      }
    } // Returns true if user is logged in and has data.

  }, {
    key: "isLoggedIn",
    value: function isLoggedIn() {
      return this.isAuthenticated() && this.exists();
    }
  }, {
    key: "isAuthenticated",
    value: function isAuthenticated() {
      return this.authenticated === true;
    }
  }, {
    key: "exists",
    value: function exists() {
      return this.getID() > 0;
    } // Returns true if the user has a specific capability.

  }, {
    key: "hasCap",
    value: function hasCap(capability) {
      if (!this.isLoggedIn() || !this.exists()) {
        return false;
      }

      if (!this.data.capabilities || !Object.prototype.hasOwnProperty.call(this.data.capabilities, capability)) {
        return false;
      }

      return true === this.data.capabilities[capability];
    }
  }, {
    key: "getID",
    value: function getID() {
      var ID = this.data.ID ? parseInt(this.data.ID) : 0;
      return ID > 0 ? ID : 0;
    }
  }, {
    key: "getDisplayName",
    value: function getDisplayName() {
      return this.data.display_name || null;
    }
  }, {
    key: "getUsername",
    value: function getUsername() {
      return this.data.username || null;
    }
  }, {
    key: "getFirstName",
    value: function getFirstName() {
      return this.data.first_name || null;
    }
  }, {
    key: "getLastName",
    value: function getLastName() {
      return this.data.last_name || null;
    }
  }, {
    key: "getEmail",
    value: function getEmail() {
      return this.data.email || null;
    }
  }, {
    key: "getBio",
    value: function getBio() {
      return this.data.bio || null;
    }
  }, {
    key: "getWebsite",
    value: function getWebsite() {
      return this.data.website || null;
    }
  }, {
    key: "getTwitter",
    value: function getTwitter() {
      return this.data.twitter || null;
    }
  }, {
    key: "getCompany",
    value: function getCompany() {
      return this.data.company || null;
    }
  }, {
    key: "getCompanyPosition",
    value: function getCompanyPosition() {
      return this.data.company_position || null;
    }
  }, {
    key: "getSlack",
    value: function getSlack() {
      return this.data.slack || null;
    }
  }]);

  return wpcMember;
}();

var initialState = {
  user: new wpcMember(),
  isLoading: true
};

var reducer = function reducer() {
  var state = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : initialState;
  var action = arguments.length > 1 ? arguments[1] : undefined;

  switch (action.type) {
    case "setUser":
      {
        // Is populated with user data.
        var user = action.payload.user; // Replace with new user.

        var newUser = new wpcMember(user); // @TODO append, replace, or merge with user?

        return Object.assign({}, state, {
          user: newUser,
          isLoading: false
        });
      }

    case "finishLoading":
      {
        return Object.assign({}, state, {
          isLoading: false
        });
      }

    default:
      return state;
  }
};

var sessionStore = function sessionStore() {
  return (0, _redux.createStore)(reducer, initialState);
};

var SessionProvider = function SessionProvider(_ref3) {
  var element = _ref3.element;

  /*
   * Instantiating store in `wrapRootElement` handler ensures:
   * - there is fresh store for each SSR page
   * - it will be called only once in browser, when React mounts
   */
  var store = sessionStore();
  var providerAttr = {
    store: store
  }; // "Silently" check authentication when app loads.

  silentAuth(store);
  return /*#__PURE__*/_react["default"].createElement(_reactRedux.Provider, providerAttr, element);
};

exports.SessionProvider = SessionProvider;
SessionProvider.propTypes = {
  element: _propTypes["default"].node
};
