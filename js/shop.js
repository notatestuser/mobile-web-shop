/* global Hammer: true */
/* global angular: true */

'use strict';

angular.module('axsy.testshop.main', [])

.constant('CURRENCY_SYMBOL', '£')
.constant('CURRENCY_FRACTION_SIZE', 0)
.constant('DEFAULT_ITEMS_FETCH_LIMIT', 16)

// --- services ---

.factory('CatalogueService', [
    '$http',
    'DEFAULT_ITEMS_FETCH_LIMIT',
function($http, DEFAULT_ITEMS_FETCH_LIMIT) {
    var CATALOGUE_URL = './exercise/catalogue_items.json';
    return {
        fetchCatalogueItems: function(offset, limit) {
            if ( ! offset) {
                offset = 0;
            }
            if ( ! limit) {
                limit = DEFAULT_ITEMS_FETCH_LIMIT;
            }
            return $http
                .get(CATALOGUE_URL, { cache: true })
                .then(function(resp) {
                    return resp.data
                    .slice(offset, offset + limit)
                    .map(function(item) {
                        // set a default quantity for our "basket"
                        item._quantity = 0;
                        return item;
                    });
                });
        }
    };
}])

// --- controllers ---

.controller('StorefrontCtrl', [
    '$log',
    '$scope',
    'CatalogueService',
function($log, $scope, CatalogueService) {
    var itemsOffset = 0;

    $scope.catalogueItems = [];

    function fetchMoreItems(offset) {
        // default offset?
        if (offset === undefined) {
            offset = itemsOffset;
        }
        $scope.isLoading = true;
        return CatalogueService.fetchCatalogueItems(offset)
        .then(function(items) {
            // this looks like a hack,
            // but it's a way to add items to an array by reference
            $scope.isLoading = false;
            return items;
        });
    }

    function addItems(items) {
        return Array.prototype.push.apply($scope.catalogueItems, items);
    }

    function addItemsAndIncreaseOffset(items) {
        itemsOffset += items.length;
        return addItems(items);
    }

    // initial populate
    fetchMoreItems(itemsOffset).then(addItemsAndIncreaseOffset);

    $scope.loadMoreItems = function() {
        if ($scope.isLoading) {
            return;
        }
        $log.info('Loading more items', {offset: itemsOffset});
        return fetchMoreItems(itemsOffset).then(addItemsAndIncreaseOffset);
    };
}])

// --- directives ---

.directive('purchasableItem', [
    '$timeout',
function($timeout) {
    // the swipe class is removed when this elapses
    var SWIPE_ANIMATION_DURATION_MS = 800;  // .8s
    return {
        require: 'ngModel',
        restrict: 'AC',
        controller: [
            '$scope',
            '$filter',
            'CURRENCY_SYMBOL',
            'CURRENCY_FRACTION_SIZE',
        function($scope, $filter, CURRENCY_SYMBOL, CURRENCY_FRACTION_SIZE) {
            var currencySymbol = CURRENCY_SYMBOL;
            // getItemImageStyle
            $scope.getItemImageStyle = function(item) {
                var cacheBusterParam = '?_cachebuster_' + item.uuid;
                return {
                    'background-image': 'url(http://lorempixel.com/64/64/'+cacheBusterParam+')'
                };
            };
            // getItemPrice
            $scope.getItemPrice = function(item) {
                var unitPrice = item.unit_price;
                // safari does not support Number.isNaN :(
                if (NaN === parseInt(unitPrice)) {
                    return 'n/a';
                }
                if (item.unit_price <= 0) {
                    return 'FREE';
                }
                var displayPrice = $filter('currency')(unitPrice, currencySymbol, CURRENCY_FRACTION_SIZE);
                return displayPrice;
            };
        }],
        link: function(scope, elem, attrs, ngModel) {
            // adjustItemQuantity: swiping changes the quantity via this function
            function adjustItemQuantity(increment) {
                var adjustedQuantity = scope.getItemQuantity() + increment;
                adjustedQuantity = Math.max(0, adjustedQuantity);  // >= 0
                elem.attr('data-quantity', adjustedQuantity);
                ngModel.$setViewValue(adjustedQuantity);
            }
            // getItemQuantity: return the _quantity attribute of the item
            scope.getItemQuantity = function() {
                return ngModel.$modelValue || 0;
            };
            // listen for the swipe event (via hammer)
            var mc = new Hammer.Manager(elem[0], {
                recognizers: [
                    // Hammer.Swipe ref: http://hammerjs.github.io/recognizer-swipe
                    [Hammer.Swipe, {
                        direction: Hammer.DIRECTION_HORIZONTAL,
                        threshold: 3
                    }],
                ]
            });
            var swipeMutex = false;  // one swipe at a time
            mc.on('swipe', function(ev) {
                if (swipeMutex) {
                    return;
                }
                swipeMutex = true;
                switch (ev.direction) {
                    case Hammer.DIRECTION_LEFT:
                        adjustItemQuantity(-1);
                        elem.addClass('swiping swiping-left');
                        break;
                    case Hammer.DIRECTION_RIGHT:
                        adjustItemQuantity(1);
                        elem.addClass('swiping swiping-right');
                        break;
                }
                $timeout(function(){
                    elem.removeClass('swiping swiping-left swiping-right');
                }, SWIPE_ANIMATION_DURATION_MS)
                .then(function(){
                    swipeMutex = false;
                });
            });
            // init
            adjustItemQuantity(0);
        }
    };
}])

.directive('onInfiniteScroll', [
    '$document',
    '$window',
function($document, $window) {
    var INFINITE_SCROLL_ZONE_BOTTOM_OFFSET = 100;
    function getDocumentHeight() {
        // from http://stackoverflow.com/a/1147768
        var body = $document[0].body,
            html = $document[0].documentElement;
        var height = Math.max( body.scrollHeight, body.offsetHeight,
                               html.clientHeight, html.scrollHeight, html.offsetHeight );
        return height;
    }
    return {
        restrict: 'A',
        link: function(scope, elem, attrs) {
            var $$window = angular.element($window);
            var mutex = false;
            function resetMutex() {
                mutex = false;
            }
            $$window.on('scroll', function(){
                if (mutex) return;
                // are we at the bottom of the page?
                if ($window.scrollY + $window.innerHeight >
                        getDocumentHeight() - INFINITE_SCROLL_ZONE_BOTTOM_OFFSET) {
                    mutex = true;
                    scope.$eval(attrs.onInfiniteScroll)
                    .then(resetMutex, resetMutex);
                }
            });
        }
    };
}])

// --- filters ---

.filter('toFixed', function() {
    return function(num, precision) {
        return (num || 0).toFixed(precision || 2);
    };
});

// --- int main() ---

angular.element(document).ready(function(){
    angular.bootstrap(document, ['axsy.testshop.main']);
});
