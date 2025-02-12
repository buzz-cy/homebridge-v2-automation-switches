'use strict';

let Accessory, Characteristic, Service;

class RandomAccessory {

  constructor(api, log, config) {
    Accessory = api.hap.Accessory;
    Characteristic = api.hap.Characteristic;
    Service = api.hap.Service;

    this.log = log;
    this.name = config.name.replace(/[^a-zA-Z0-9 ']/g, '').trim();
    if (!/^[a-zA-Z0-9]/.test(this.name)) {
        this.name = 'Accessory ' + this.name;
    }
    this.config = config;

    this._state = {
      randomValue: 0,
    };

    this._maxValue = config.max || 1;

    this._services = this.createServices();
  }

  getServices() {
    return this._services;
  }

  createServices() {
    return [
      this.getAccessoryInformationService(),
      this.getSwitchService(),
    ];
  }

  getAccessoryInformationService() {
    return new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Buzz-cy')
      .setCharacteristic(Characteristic.Model, 'Switch')
      .setCharacteristic(Characteristic.SerialNumber, this.config.serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, this.config.version)
      .setCharacteristic(Characteristic.HardwareRevision, this.config.version);
  }

  getSwitchService() {
    this._switchService = new Service.Switch(this.name);
    this._switchService.getCharacteristic(Characteristic.On)
      .on('set', this._setState.bind(this));

    // Use an existing characteristic for random value
    this._switchService.addCharacteristic(Characteristic.CurrentTemperature);

    this._switchService.isPrimaryService = true;

    return this._switchService;
  }

  identify(callback) {
    this.log(`Identify requested on ${this.name}`);
    callback();
  }

  _pickRandomValue() {
    const minValue = 1;
    const maxValue = this._maxValue;

    this._state.randomValue = parseInt(Math.floor(Math.random() * (maxValue - minValue + 1) + minValue));
    this.log(`Picked random value: ${this._state.randomValue}`);

    if (this._switchService) {
      // Update the characteristic to reflect the random value
      this._switchService.getCharacteristic(Characteristic.CurrentTemperature).updateValue(this._state.randomValue);
    } else {
        this.log(`Warning: _switchService is undefined for ${this.name}`);
    }
  }

  _setState(value, callback) {
    this.log(`Change target state of ${this.name} to ${value}`);

    if (value) {
      this._pickRandomValue();

      // Turn off the switch after 1 second
      setTimeout(() => {
        this._switchService.setCharacteristic(Characteristic.On, false);
      }, 1000);
    }

    callback();
  }
}

module.exports = RandomAccessory;
