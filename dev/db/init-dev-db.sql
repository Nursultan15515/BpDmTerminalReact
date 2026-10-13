-- Локальная БД стенда в LocalDB: схема как в боевой DbTerminalBpDm (легаси Model1.edmx).
-- Повторный запуск безопасен: создаёт только то, чего ещё нет, данные не трогает.
IF DB_ID(N'DbTerminalBpDm') IS NULL
    CREATE DATABASE DbTerminalBpDm;
GO
USE DbTerminalBpDm;
GO
IF OBJECT_ID(N'dbo.TerminalInfo') IS NULL
    CREATE TABLE dbo.TerminalInfo (
        Id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
        TerminalName nvarchar(50) NOT NULL,
        IpAddress nvarchar(50) NOT NULL);
IF OBJECT_ID(N'dbo.SearchRequestInfo') IS NULL
    CREATE TABLE dbo.SearchRequestInfo (
        Id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
        IpAddress nvarchar(50) NOT NULL,
        SearchValue nvarchar(1000) NULL,
        CreatedDateTime datetime NULL);
IF OBJECT_ID(N'dbo.PassCardVisitorInfoLog') IS NULL
    CREATE TABLE dbo.PassCardVisitorInfoLog (
        Id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CreatedDateTime datetime NOT NULL,
        PassCardVisitorId nvarchar(50) NOT NULL,
        RfidNumber nvarchar(50) NULL,
        Notice nvarchar(2000) NULL);
IF OBJECT_ID(N'dbo.TerminalError') IS NULL
    CREATE TABLE dbo.TerminalError (
        Id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CreatedDate datetime NOT NULL,
        IdAddress nvarchar(50) NULL,
        Description nvarchar(max) NOT NULL,
        Notice nvarchar(max) NULL);
GO
-- Браузер на этом же ПК: бэкенд видит 127.0.0.1 или ::1 (прокси Vite ходит по IPv6).
IF NOT EXISTS (SELECT 1 FROM dbo.TerminalInfo WHERE IpAddress = N'127.0.0.1')
    INSERT INTO dbo.TerminalInfo (TerminalName, IpAddress) VALUES (N'DevTerminal', N'127.0.0.1');
IF NOT EXISTS (SELECT 1 FROM dbo.TerminalInfo WHERE IpAddress = N'::1')
    INSERT INTO dbo.TerminalInfo (TerminalName, IpAddress) VALUES (N'DevTerminal', N'::1');
GO
