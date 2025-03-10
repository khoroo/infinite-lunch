% 
% Traveling Salesman Problem, integer programming model in MiniZinc.
% 
% From GLPK:s example tsp.mod
% """
% TSP, Traveling Salesman Problem
%
% Written in GNU MathProg by Andrew Makhorin <mao@mai2.rcnet.ru> */
%
% The Traveling Salesman Problem (TSP) is stated as follows.
% Let a directed graph G = (V, E) be given, where V = {1, ..., n} is
% a set of nodes, E <= V x V is a set of arcs. Let also each arc
% e = (i,j) be assigned a number c[i,j], which is the length of the
% arc e. The problem is to find a closed path of minimal length going
% through each node of G exactly once.
% """

% Note: Almost all comments below are from tsp.mod.


% 
% This MiniZinc model was created by Hakan Kjellerstrand, hakank@bonetmail.com
% See also my MiniZinc page: http://www.hakank.org/minizinc
%

% Note: 
% Solving with ECLiPSe/eplex (occurrence, indomain_min, complete) took about 6.5 minutes:
% total = 6859
% x = [0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0]
% y = [0,0,0,0,0,0,0,0,0,0,0,0,15,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,0,7,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,0,0,0,0,0,0,0,0,0]
% Minimum objective value = 6859.0000000000009
%

% number of nodes 
int: n;

% set of arcs 
int: num_edges;
array[1..num_edges, 1..2] of 1..n: E;

% distance from node i to node j 
array[1..num_edges] of int: c;

% x[i,j] = 1 means that the salesman goes from node i to node j 
array[1..num_edges] of var 0..1: x;

% y[i,j] is the number of cars, which the salesman has after leaving
% node i and before entering node j; in terms of the network analysis,
% y[i,j] is a flow through arc (i,j) 
array[1..num_edges] of var int: y;

% the objective is to make the path length as small as possible 
var int: total = sum(i in 1..num_edges) (c[i] * x[i]);
solve :: int_search(
    [x[i] | i in 1..num_edges] ++
    [y[i] | i in 1..num_edges] ++
    [total],
   first_fail, % "occurrence",
   indomain_max,
   complete
   )
   minimize total;

constraint

   % the salesman leaves each node i exactly once 
   forall(i in 1..n) (
        sum(k in 1..num_edges where E[k,1] = i) (x[k]) = 1
   )

   /\

   % the salesman enters each node j exactly once 
   forall(j in 1..n) (
        sum(k in 1..num_edges where E[k,2] = j) (x[k]) = 1
   )

   /\

   % From tsp.mod:
   % """
   % Constraints above are not sufficient to describe valid tours, so we
   % need to add constraints to eliminate subtours, i.e. tours which have
   % disconnected components. Although there are many known ways to do
   % that, I invented yet another way. The general idea is the following.
   % Let the salesman sells, say, cars, starting the travel from node 1,
   % where he has n cars. If we require the salesman to sell exactly one
   % car in each node, he will need to go through all nodes to satisfy
   % this requirement, thus, all subtours will be eliminated. 
   % 
   % 
   % if arc (i,j) does not belong to the salesman's tour, its capacity
   % must be zero; it is obvious that on leaving a node, it is sufficient
   % to have not more than n-1 cars 
   % """
 
   % Later comment 2022-04-22)
   % According to Ties Westendorp (https://github.com/hakank/hakank/discussions/14)
   % """
   % I would like to point out that though the model formulation was well found - it is by
   % no means novel. This is in fact exactly the Gavish-Graves formulation for TSP.
   % """
   forall(k in 1..num_edges) (
      y[k] >= 0
      /\
      y[k] <= (n-1) * x[k]
   )

   /\
   % node[i] is a conservation constraint for node i 
   forall(i in 1..n) (
      % summary flow into node i through all ingoing arcs 
      (
      sum(k in 1..num_edges where E[k,2] = i) (y[k])
      % plus n cars which the salesman has at starting node 
      + (if i = 1 then n else 0 endif)
      )
      = % must be equal to 
      % summary flow from node i through all outgoing arcs 
      (
      sum(k in 1..num_edges where E[k,1] = i) (y[k])
      % plus one car which the salesman sells at node i 
      + 1
      )
   )

;
