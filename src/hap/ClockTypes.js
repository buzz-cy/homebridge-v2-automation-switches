'use strict';

module.exports = {
  registerWith: function (hap) {
    const { Characteristic, Service } = hap;

    class ClockHour extends Characteristic {
      constructor() {
        super('Hour', 'B534E0E3-2CB9-4A66-9353-EC886C949485');
        
        this.setProps({
          format: Characteristic.Formats.INT,
          minValue: 0,
          maxValue: 23,
          perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE],
        });

        this.value = this.getDefaultValue();
      }
    }
    Characteristic.ClockHour = ClockHour;

    class ClockMinute extends Characteristic {
      constructor() {
        super('Minute', '9DD407F8-C090-4D57-9305-03F0679897B3');
        this.setProps({
          format: Characteristic.Formats.INT,
          minValue: 0,
          maxValue: 59,
          perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE],
        });

        this.value = this.getDefaultValue();
      }
    }
    Characteristic.ClockMinute = ClockMinute;

    class ClockService extends Service {
      constructor(displayName, subtype) {
        super(displayName, '4FA3884A-D165-4248-8D0B-850F6086DDD4', subtype);
        this.addCharacteristic(Characteristic.ClockHour);
        this.addCharacteristic(Characteristic.ClockMinute);
      }
    }
    Service.Clock = ClockService;
  }
};
