import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const GuestApplication = sequelize.define('GuestApplication', {
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    birthDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    birthPlace: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    internshipStartDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    internshipEndDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true, // Assuming email should be unique for applications
      validate: {
        isEmail: true,
      },
    },
    nationality: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    gender: {
      type: DataTypes.ENUM('ERKEK', 'KADIN', 'DİĞER'),
      allowNull: true,
    },
    militaryStatus: {
      type: DataTypes.STRING, // e.g., 'YAPILDI', 'TECİLLİ', 'MUAF'
      allowNull: true,
    },
    educationInfo: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    languageInfo: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    computerInfo: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    internshipDepartment: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    semesterGrade: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    acceptEmail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    acceptKvkk: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    tableName: 'GuestApplications',
    timestamps: true,
  });

  return GuestApplication;
};