'use strict';

const nodePersist = require('node-persist');
const NameFactory = require('./NameFactory');

class StorageWrapper {
  constructor(api, log, type, name) {
    this._key = `${type}.${NameFactory.generate(name)}.json`;
    log(`Switch ${name} is stored in file ${this._key}`);

    this.storage = nodePersist.create();
    this.storage.init({
      dir: api.user.persistPath(),
      forgiveParseErrors: true,
    }).then(() => {
      this.ready = true;
    }).catch((err) => {
      this.ready = false;
      log(`Storage initialization failed: ${err}`);
    });
  }

  async store(value) {
    try {
        await this.storage.setItem(this._key, value);
    } catch (error) {
        console.error(`Error storing data for ${this._key}: ${error.message}`);
    }
  }

  async retrieve() {
    try {
      if (!this.ready) {
        console.warn(`Storage not ready for key: ${this._key}, attempting re-initialization.`);
        await this.storage.init(); 
        this.ready = true;
      }

      if (!this.storage || typeof this.storage.getItem !== 'function') {
        console.error(`Storage not properly initialized for key: ${this._key}`);
        return null;
      }

      const storedData = await this.storage.getItem(this._key);
      
      if (storedData !== undefined) {
        return storedData;
      } else {
        console.log(`No stored data found for ${this._key}, returning default state.`);
        return null;
      }
    } catch (error) {
      console.error(`Error retrieving data for ${this._key}: ${error.message}`);
      return null;
    }
  }

}
module.exports = StorageWrapper;
