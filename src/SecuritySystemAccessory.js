'use strict';

const clone = require('clone');

let Accessory, Characteristic, Service;

const SecuritySystemStates = [
    "STAY_ARM",   // 0
    "AWAY_ARM",   // 1
    "NIGHT_ARM",  // 2
    "DISARMED",   // 3
    "ALARM_TRIGGERED" // 4
];

class SecuritySystemAccessory {
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

        this.zones = config.zones || ['Alarm'];
        this.armAwayButtonLabel = config.armAwayButtonLabel || `${this.name} Arm Away`;
        this.armStayButtonLabel = config.armStayButtonLabel || `${this.name} Arm Stay`;
        this.armNightButtonLabel = config.armNightButtonLabel || `${this.name} Arm Night`;

        this._state = {
            targetState: Characteristic.SecuritySystemTargetState.STAY_ARM,
            currentState: Characteristic.SecuritySystemCurrentState.DISARMED
        };

        this._loadStoredState();

        this._services = this.createServices();
    }

    async _loadStoredState() {
        try {
            const storedData = await this._storage.retrieve();
            if (storedData) {
                this._state = storedData;
            }
    
            this._state.targetState = this._validateState(this._state.targetState, Characteristic.SecuritySystemTargetState.STAY_ARM);
            this._state.currentState = this._validateState(this._state.currentState, this._state.targetState);
        
            if (this._securitySystemService) {
                this._securitySystemService.getCharacteristic(Characteristic.SecuritySystemTargetState).updateValue(this._state.targetState);
                this._securitySystemService.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(this._state.currentState);
            } else {
                this.log(`Warning: _securitySystemService is undefined for ${this.name}`);
            }
        } catch (error) {
            this.log(`Error loading stored state for ${this.name}: ${error}`);
        }
    }

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
            this.getSecuritySystemService(),
            this.getArmAwaySwitch(),
            this.getArmStaySwitch(),
            this.getArmNightSwitch(),
            this.getDisarmSwitch()
        ];
    }

    getAccessoryInformationService() {
        return new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.Manufacturer, 'Buzz-cy')
            .setCharacteristic(Characteristic.Model, 'Security System')
            .setCharacteristic(Characteristic.SerialNumber, this._config.serialNumber)
            .setCharacteristic(Characteristic.FirmwareRevision, this._config.version)
            .setCharacteristic(Characteristic.HardwareRevision, this._config.version);    }

    getSecuritySystemService() {
        this._securitySystemService = new Service.SecuritySystem(this.name);

        this._securitySystemService.getCharacteristic(Characteristic.SecuritySystemTargetState)
            .on('set', this._setTargetState.bind(this))
            .on('get', (callback) => {
                callback(null, this._state.targetState);
            })
            .updateValue(this._state.targetState);

        this._securitySystemService.getCharacteristic(Characteristic.SecuritySystemCurrentState)
            .on('get', (callback) => {
                callback(null, this._state.currentState);
            })
            .updateValue(this._state.currentState);

        this._securitySystemService.isPrimaryService = true;
        return this._securitySystemService;
    }

    getArmAwaySwitch() {
        this._armAwaySwitchService = new Service.Switch(this.armAwayButtonLabel, "ArmAway");
        this._armAwaySwitchService.getCharacteristic(Characteristic.On)
            .on('set', (value, callback) => this._setTargetState(Characteristic.SecuritySystemTargetState.AWAY_ARM, callback))
            .on('get', (callback) => callback(null, this._isArmAway()));

        return this._armAwaySwitchService;
    }

    getArmStaySwitch() {
        this._armStaySwitchService = new Service.Switch(this.armStayButtonLabel, "ArmStay");
        this._armStaySwitchService.getCharacteristic(Characteristic.On)
            .on('set', (value, callback) => this._setTargetState(Characteristic.SecuritySystemTargetState.STAY_ARM, callback))
            .on('get', (callback) => callback(null, this._isArmStay()));

        return this._armStaySwitchService;
    }

    getArmNightSwitch() {
        this._armNightSwitchService = new Service.Switch(this.armNightButtonLabel, "ArmNight");
        this._armNightSwitchService.getCharacteristic(Characteristic.On)
            .on('set', (value, callback) => this._setTargetState(Characteristic.SecuritySystemTargetState.NIGHT_ARM, callback))
            .on('get', (callback) => callback(null, this._isArmNight()));

        return this._armNightSwitchService;
    }

    getDisarmSwitch() {
        this._disarmSwitchService = new Service.Switch(`${this.name} Disarm`, "Disarm");
        this._disarmSwitchService.getCharacteristic(Characteristic.On)
            .on('set', (value, callback) => this._setTargetState(Characteristic.SecuritySystemTargetState.DISARMED, callback))
            .on('get', (callback) => callback(null, this._isDisarmed()));

        return this._disarmSwitchService;
    }

    identify(callback) {
        this.log(`Identify requested on ${this.name}`);
        callback();
    }

    async _setTargetState(value, callback) {
        this.log(`Changing targetState of ${this.name} to ${SecuritySystemStates[value]}`);
    
        this._state.targetState = this._validateState(value, Characteristic.SecuritySystemTargetState.STAY_ARM);
        this._state.currentState = this._state.targetState;
    
        try {
            await this._persist(this._state);
    
            if (this._securitySystemService) {
                this._securitySystemService.getCharacteristic(Characteristic.SecuritySystemTargetState).updateValue(this._state.targetState);
                this._securitySystemService.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(this._state.currentState);
            }
    
            callback();
        } catch (error) {
            this.log(`Error persisting targetState for ${this.name}: ${error}`);
            callback(error);
        }
    }

    async _persist(data) {
        try {
            await this._storage.store(data);
            this._state = data;
        } catch (error) {
            this.log(`Error saving targetState for ${this.name}: ${error}`);
        }
    }

    _isArmAway() {
        return this._state.targetState === Characteristic.SecuritySystemTargetState.AWAY_ARM;
    }

    _isArmStay() {
        return this._state.targetState === Characteristic.SecuritySystemTargetState.STAY_ARM;
    }

    _isArmNight() {
        return this._state.targetState === Characteristic.SecuritySystemTargetState.NIGHT_ARM;
    }

    _isDisarmed() {
        return this._state.targetState === Characteristic.SecuritySystemTargetState.DISARMED;
    }
}

module.exports = SecuritySystemAccessory;