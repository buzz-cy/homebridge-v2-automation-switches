'use strict';

const clone = require('clone');

let Accessory, Characteristic, Service;

class SliderAccessory {

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
      value: config.default !== undefined ? config.default : 50, // Default brightness
      on: true // Assume ON unless stored otherwise
    };

    this._restoreState();
    this._services = this.createServices();
  }

  getServices() {
    return this._services;
  }

  createServices() {
    return [
      this.getAccessoryInformationService(),
      this.getSliderService()
    ];
  }

  getAccessoryInformationService() {
    return new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Buzz-cy')
      .setCharacteristic(Characteristic.Model, 'Slider')
      .setCharacteristic(Characteristic.SerialNumber, this._config.serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, this._config.version)
      .setCharacteristic(Characteristic.HardwareRevision, this._config.version);
  }

  getSliderService() {
    this._sliderService = new Service.Lightbulb(this.name);

    this._sliderService.getCharacteristic(Characteristic.On)
      .on('set', this._setState.bind(this))
      .on('get', callback => {
        callback(null, this._state.on);
      })
      .updateValue(this._state.on);

    this._sliderService.getCharacteristic(Characteristic.Brightness)
      .on('set', this._setValue.bind(this))
      .on('get', callback => {
        if (typeof this._state.value === 'undefined') {
          this.log(`Value undefined for ${this.name}, resetting to 50`);
          this._state.value = 50;
        }
        callback(null, this._state.value);
      })
      .updateValue(this._state.value);

    return this._sliderService;
  }

  identify(callback) {
    this.log(`Identify requested on ${this.name}`);
    callback();
  }

  async _setState(value, callback) {
    const data = clone(this._state);
    data.on = !!value;

    await this._persist(data);

    if (this._sliderService) {
        this._sliderService.getCharacteristic(Characteristic.On).updateValue(data.on);
    }

    callback();
  }

  async _setValue(value, callback) {
    this.log(`Changing brightness of ${this.name} to ${value}`);

    const data = clone(this._state);
    data.value = value;

    // If brightness is 0, turn OFF but **keep brightness stored**
    if (value === 0) {
        data.on = false;
        this.log(`Brightness is 0, turning off ${this.name}`);
    } else {
        data.on = true;
    }

    await this._persist(data);

    if (this._sliderService) {
        this._sliderService.getCharacteristic(Characteristic.Brightness).updateValue(data.value);
        this._sliderService.getCharacteristic(Characteristic.On).updateValue(data.on);
    }

    callback();
  }

  async _persist(data) {
    if (!this._config.stored) {
        this.log(`Persistent storage disabled for ${this.name}, skipping save.`);
        return;
    }

    try {
        await this._storage.store(data);
        this._state = data;
    } catch (error) {
        this.log(`Error saving state for ${this.name}: ${error}`);
    }
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
          if (this._sliderService) {
              this._sliderService.getCharacteristic(Characteristic.Brightness).updateValue(this._state.value);
              this._sliderService.getCharacteristic(Characteristic.On).updateValue(this._state.on);
          } else {
              this.log(`Warning: _sliderService is undefined for ${this.name}`);
          }
        }, 250);
    } else {
        this.log(`No stored state found for ${this.name}, using defaults.`);
    }
  }

  async _setBrightness(value) {
    this.log(`Changing brightness of ${this.name} to ${value}`);

    this._state.value = value;
    this._state.on = value > 0; // Ensure "On" state updates with brightness

    await this._storage.save(this._state); // Save brightness before updating UI

    setTimeout(() => {
        this._sliderService
            .getCharacteristic(Characteristic.Brightness)
            .updateValue(this._state.value);
        this._sliderService
            .getCharacteristic(Characteristic.On)
            .updateValue(this._state.on);
    }, 200);
  }

}

module.exports = SliderAccessory;
