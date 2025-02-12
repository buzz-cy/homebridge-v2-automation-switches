'use strict';

const clone = require('clone');

let Accessory, Characteristic, Service;

const LockMechanismStates = [
  'Unsecured',
  'Secured',
  'Jammed',
  'Unknown',
  'Alarm triggered'
];

class LockMechanismAccessory {
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

    this._state = {
      targetState: this._pickDefault(config.default),
      currentState: Characteristic.LockCurrentState.UNSECURED
    };



    this._restoreState();
    this._services = this.createServices();
  }

  _pickDefault(value) {
    if (value === 'locked') {
      return Characteristic.LockTargetState.SECURED;
    }
    if (value === 'unlocked' || value === undefined) {
      return Characteristic.LockTargetState.UNSECURED;
    }
    throw new Error('Unsupported default value in configuration of lock.');
  }

  /**
   * Validates HomeKit states, ensuring they are within expected ranges.
   */
  _validateState(value, defaultValue) {
    if (typeof value !== 'number' || isNaN(value)) {
      this.log(`Invalid state detected (${value}), resetting to default: ${defaultValue}`);
      return defaultValue;
    }
    return value;
  }

  getServices() {
    return this._services;
  }

  createServices() {
    return [
      this.getAccessoryInformationService(),
      this.getLockMechanismService()
    ];
  }

  getAccessoryInformationService() {
    return new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Buzz-cy')
      .setCharacteristic(Characteristic.Model, 'Lock Mechanism')
      .setCharacteristic(Characteristic.SerialNumber, this._config.serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, this._config.version)
      .setCharacteristic(Characteristic.HardwareRevision, this._config.version);
  }

  getLockMechanismService() {
    this._lockService = new Service.LockMechanism(this.name);

    this._lockService.getCharacteristic(Characteristic.LockTargetState)
      .on('set', this._setTargetState.bind(this))
      .on('get', (callback) => {
        callback(null, this._state.targetState);
      })
      .updateValue(this._state.targetState);

    this._lockService.getCharacteristic(Characteristic.LockCurrentState)
      .on('get', (callback) => {
        callback(null, this._state.currentState);
      })
      .updateValue(this._state.currentState);

    this._lockService.isPrimaryService = true;
    return this._lockService;
  }

  identify(callback) {
    this.log(`Identify requested on ${this.name}`);
    callback();
  }

  _updateCurrentState() {
    let currentState = this._state.targetState;

    this._lockService
      .getCharacteristic(Characteristic.LockCurrentState)
      .updateValue(currentState);
  }

  async _setTargetState(value, callback) {
    this._state.targetState = value;
    this._state.currentState = value; // Sync current state
    this._lockService.getCharacteristic(Characteristic.LockTargetState).updateValue(value);
    this._lockService.getCharacteristic(Characteristic.LockCurrentState).updateValue(value);

    await this._persist();

    callback();
  }

  async _persist() {
    if (!this._storage) return;

    try {
        await this._storage.store(this._state);
    } catch (error) {
        this.log(`Error persisting state for ${this.name}: ${error}`);
    }
  }

  async _restoreState() {
    if (!this._config.stored || !this._storage) {
        this.log(`Persistent storage disabled for ${this.name}, using defaults.`);
        return;
    }

    try {
        const storedData = await this._storage.retrieve();
        if (!storedData) {
            this.log(`No stored state found, using defaults.`);
            return;
        }

        this._state = storedData;
        this._state.targetState = storedData.targetState ?? Characteristic.LockTargetState.UNSECURED;
        this._state.currentState = storedData.currentState ?? this._state.targetState;
        if (this._lockService) {
          this._lockService.getCharacteristic(Characteristic.LockTargetState).updateValue(this._state.targetState);
          this._lockService.getCharacteristic(Characteristic.LockCurrentState).updateValue(this._state.currentState);
        } else {
            this.log(`Warning: _lockService is undefined for ${this.name}`);
        }

    } catch (error) {
        this.log(`Error restoring state for ${this.name}: ${error}`);
    }
  }
}

module.exports = LockMechanismAccessory;
