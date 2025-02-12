'use strict';

const clone = require('clone');

let Accessory, Characteristic, Service;

class SwitchAccessory {
  constructor(api, log, config, storage) {
    Accessory = api.hap.Accessory;
    Characteristic = api.hap.Characteristic;
    Service = api.hap.Service;

    this.log = log;
    this.name = config.name.replace(/[^a-zA-Z0-9 ']/g, '').trim();
    if (!/^[a-zA-Z0-9]/.test(this.name)) {
        this.name = 'Accessory ' + this.name;
    }
    this._config = config;
    this._storage = storage;

    this._state = { state: config.default !== undefined ? !!config.default : false };


    this._restoreState();
    this._services = this.createServices();
  }

  getServices() {
    return this._services;
  }

  createServices() {
    return [
      this.getAccessoryInformationService(),
      this.getSwitchService()
    ];
  }

  getAccessoryInformationService() {
    return new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Buzz-cy')
      .setCharacteristic(Characteristic.Model, 'Switch')
      .setCharacteristic(Characteristic.SerialNumber, this._config.serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, this._config.version)
      .setCharacteristic(Characteristic.HardwareRevision, this._config.version);
  }

  getSwitchService() {
    this._switchService = new Service.Switch(this.name);

    this._switchService.getCharacteristic(Characteristic.On)
      .on('set', this._setState.bind(this))
      .on('get', (callback) => {
        if (typeof this._state.state === 'undefined') {
          this.log(`⚠️ State undefined for ${this.name}, resetting to false`);
          this._state.state = false;
        }

        callback(null, this._state.state);
      })
      .updateValue(this._state.state);

    this._switchService.isPrimaryService = true;
    return this._switchService;
  }

  identify(callback) {
    this.log(`Identify requested on ${this.name}`);
    callback();
  }

  async _setState(value, callback) {
    this.log(`Changing state of ${this.name} to ${value}`);

    if (this._switchService) {
        this._switchService.getCharacteristic(Characteristic.On).updateValue(value);
    }

    const data = clone(this._state);
    data.state = !!value;

    this._persist(data).then(() => {
    }).catch((error) => {
        this.log(`Error persisting state: ${error}`);
    });

    callback();
  }

  async _persist(data) {
    if (!this._config.stored) {
        this.log(`Persistent storage disabled for ${this.name}, skipping save.`);
        return;
    }

    this._storage.store(data, (error) => {
        if (error) {
            this.log(`Error saving state for ${this.name}: ${error}`);
            return;
        }

        this._state = data;
    });
  }

  async _restoreState() {
    if (!this._config.stored) {
        this.log(`No persistent storage for ${this.name}, using defaults.`);
        return;
    }

    const storedState = await this._storage.retrieve();

    if (storedState !== null) {
        this._state = storedState;

        setTimeout(() => {
          if (this._switchService) {
              this._switchService.getCharacteristic(Characteristic.On).updateValue(this._state.state);
          } else {
              this.log(`Warning: _switchService is undefined for ${this.name}`);
          }
        }, 250);
    } else {
        this.log(`No stored state found for ${this.name}, using defaults.`);
    }
}

}

module.exports = SwitchAccessory;