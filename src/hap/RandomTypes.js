'use strict';

module.exports = {
  registerWith: function (hap) {
    const { Characteristic } = hap;

    if (!Characteristic) {
      throw new Error("Homebridge Characteristic not initialized properly.");
    }

    class RandomValue extends Characteristic {
      constructor() {
        super('Value', '6B9FAFFF-1F2D-45D8-A8C7-521309858F56');

        this.setProps({
          format: (Characteristic && Characteristic.Formats) ? Characteristic.Formats.INT : 'INT',
          minValue: 0,
          maxValue: 10000,
          perms: (Characteristic && Characteristic.Perms) ? 
                 [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY] : 
                 ['pr', 'ev'],
        });
        this.value = this.getDefaultValue();
      }
    }
    Characteristic.RandomValue = RandomValue;
  }
};