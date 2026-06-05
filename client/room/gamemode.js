import * as basic from 'pixel_combats/basic';
import * as room from 'pixel_combats/room';
import * as lib from './lib.js';

// Config
const END_OF_MATCH_TIME = 10;
const VOTE_TIME = 20;

const GameStateValue = "Game";
const EndOfMatchStateValue = "End";
const EndAreaTag = "parcourend";
const SpawnAreasTag = "spawn";
const EndTriggerPoints = 1000;
const CurSpawnPropName = "CurSpawn";
const ViewSpawnsParameterName = "ViewSpawns";
const ViewEndParameterName = "ViewEnd";
const MaxSpawnsByArea = 25;
const LeaderBoardProp = "Leader";

// Room setup
const main = room.Timers.GetContext().Get('Main');
const state = room.Properties.GetContext().Get('State');
const spawns = room.Spawns.GetContext();

let endAreas = room.AreaService.GetByTag(EndAreaTag);
let spawnAreas = room.AreaService.GetByTag(SpawnAreasTag);

const MAP_ROTATION = room.GameMode.Parameters.GetBool("MapRotation");

room.BreackGraph.OnlyPlayerBlocksDmg = room.GameMode.Parameters.GetBool("PartialDesruction");
room.BreackGraph.WeakBlocks = room.GameMode.Parameters.GetBool("LoosenBlocks");

// Inventory
lib.DisableInventory();

// Team
const blueTeam = lib.BlueTeam();
blueTeam.Spawns.RespawnTime.Value = 0;

// Vote
function OnVoteResult(v) {
	if (v.Result === null) return;
	room.NewGame.RestartGame(v.Result);
}

room.NewGameVote.OnResult.Add(OnVoteResult);

function StartVote() {
	room.NewGameVote.Start({ Variants: [{ MapId: 0 }], Timer: VOTE_TIME }, MAP_ROTATION ? 3 : 0);
}

// Game state
function OnState() {
	switch (state.Value) {
		case GameStateValue:
			spawns.Enable = true;
			room.Ui.GetContext().Hint.Value = "Hint/GoParcour";
			break;

		case EndOfMatchStateValue:
			spawns.Enable = false;
			spawns.Despawn();

			room.Game.GameOver(room.LeaderBoard.GetPlayers());

			main.Restart(END_OF_MATCH_TIME);
			room.Ui.GetContext().MainTimerId.Value = main.Id;
			break;
	}
}

state.OnValue.Add(OnState);

// Visuals
function create_area_view(name, color, tags) {
	const view = room.AreaViewService.GetContext().Get(name);
	view.Color = color;
	view.Tags = tags;
	view.Enable = true;
	return view;
}

if (room.GameMode.Parameters.GetBool(ViewEndParameterName)) {
	create_area_view("EndView", new basic.Color(0, 0, 1, 1), EndAreaTag);
}
if (room.GameMode.Parameters.GetBool(ViewSpawnsParameterName)) {
	create_area_view("SpawnsView", new basic.Color(1, 1, 1, 1), SpawnAreasTag);
}

// Triggers
const endTrigger = room.AreaPlayerTriggerService.Get("EndTrigger");
endTrigger.Tags = [EndAreaTag];
endTrigger.Enable = true;

endTrigger.OnEnter.Add(function (player) {
	endTrigger.Enable = false;
	player.Properties.Get(LeaderBoardProp).Value += EndTriggerPoints;
	stateProp.Value = EndOfMatchStateValue;
});

const spawnTrigger = room.AreaPlayerTriggerService.Get("SpawnTrigger");
spawnTrigger.Tags = [SpawnAreasTag];
spawnTrigger.Enable = true;

spawnTrigger.OnEnter.Add((p, a) => {
	if (!spawnAreas.length) InitializeMap();
	if (!spawnAreas.length) return;
	const spawn = p.Properties.Get(CurSpawnPropName);
	const leader = p.Properties.Get(LeaderBoardProp);
	const start = spawn.Value ?? 0;
	for (let i = start; i < spawnAreas.length; ++i) {
		if (spawnAreas[i] !== area) continue;
		if (spawn.Value === null || i > spawn.Value) {
			spawn.Value = i;
			leader.Value += 1;
		}
		break;
	}
});

// Leaderboards
room.LeaderBoard.PlayerLeaderBoardValues = [
	{
		Value: "Deaths",
		DisplayName: "Statistics/Deaths",
		ShortDisplayName: "Statistics/DeathsShort"
	},
	{
		Value: LeaderBoardProp,
		DisplayName: "Statistics/Scores",
		ShortDisplayName: "Statistics/ScoresShort"
	}
];

room.LeaderBoard.TeamLeaderBoardValue = {
	Value: LeaderBoardProp,
	DisplayName: "Statistics/Scores",
	ShortDisplayName: "Statistics/Scores"
};

room.LeaderBoard.PlayersWeightGetter.Set(p => p.Properties.Get(LeaderBoardProp).Value);

// Events
room.Teams.OnRequestJoinTeam.Add((p, t) => t.Add(p));
room.Teams.OnPlayerChangeTeam.Add(p => p.Spawns.Spawn());

room.Damage.OnDeath.Add(p => p.Properties.Deaths.Value++);
room.Spawns.OnSpawn.Add(p => p.Properties.Spawns.Value++);

mainTimer.OnTimer.Add(StartVote);

// Init
function InitializeMap() {
	endAreas = room.AreaService.GetByTag(EndAreaTag);
	spawnAreas = room.AreaService.GetByTag(SpawnAreasTag);
	
	if (!spawnAreas.length) return;
	spawnAreas.sort((a, b) => a.Name.localeCompare(a.Name));
}

room.Map.OnLoad.Add(InitializeMap);
InitializeMap();

// Spawn logic
room.Properties.OnPlayerProperty.Add((c, v) => {
	if (v.Name !== CurSpawnPropName) return;
	SetPlayerSpawn(c.Player, v.Value);
});

function SetPlayerSpawn(p, i) {
	const spawns = room.Spawns.GetContext(p);
	spawns.CustomSpawnPoints.Clear();

	if (!spawnAreas || i < 0 || i >= spawnAreas.length) return;

	const range = spawnAreas[i].Ranges.All[0];
	
	let lookPoint = {};
	if (i < spawnAreas.length - 1) 
		lookPoint = spawnAreas[i + 1].Ranges.GetAveragePosition();
	else if (endAreas.length > 0)
		lookPoint = endAreas[0].Ranges.GetAveragePosition();

	let spawnsCount = 0;

	for (let x = range.Start.x; x < range.End.x; x += 2) 
		for (let z = range.Start.z; z < range.End.z; z += 2) {
			spawns.CustomSpawnPoints.Add(x, range.Start.y, z, room.Spawns.GetSpawnRotation(x, z, lookPoint.x, lookPoint.z));
			if (++spawnsCount >= MaxSpawnsByArea) return;
	}
}

// Start
state.Value = GameStateValue;
