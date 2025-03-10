/**
 * A dummy module to replace unnecessarily required packages.
 *
 * The dynamic nature of this module ensures that any property access will be
 * handled gracefully, throwing an error to indicate that the specific functionality
 * is not available. This approach avoids the need to hard-code specific properties
 * or methods, making the setup more robust against changes in the source code.
 */

const createThrowingProxy = (name) => {
  return new Proxy(function () {}, {
    apply: function (_target, _thisArg, _argumentsList) {
      console.log(`Calling function ${name}`);
      throw new Error(`${name} is not available.`);
    },
    get: function (_target, prop) {
      console.log(`Accessing property ${prop.toString()} on ${name}`);
      if (prop === 'default') {
        return () => {
          console.log(`Accessing default export of ${name}`);
          throw new Error('The module is not available.');
        };
      }
      if (prop === 'keys' || prop === 'values' || prop === 'entries') {
        return () => {
          console.log(`Accessing Object.${prop.toString()} on ${name}`);
          throw new Error(`Object.${prop.toString()} is not available.`);
        };
      }
      // Handle `types` object for @babel/core specifically
      if (name === 'dummy-module' && prop === 'types') {
        return new Proxy(
          {},
          {
            get: function (_target, prop) {
              console.log(`Accessing types.${prop.toString()} on ${name}`);
              return () => {
                throw new Error(`types.${prop.toString()} is not available.`);
              };
            },
          }
        );
      }
      return createThrowingProxy(`${name}.${prop.toString()}`);
    },
    set: function (_target, _prop, _value) {
      return true; // Allow setting properties without errors
    },
    has: function (_target, _prop) {
      return true; // Indicate that any property exists
    },
    getPrototypeOf: function (_target) {
      return Object.prototype;
    },
  });
};

// Create a proxy to dynamically handle property access on the dummy module
module.exports = createThrowingProxy('dummy-module');
